import { and, desc, eq, inArray } from "drizzle-orm";
import {
  academicMaterials,
  assignments,
  courses,
  inquiryMessages,
  inquiryNotes,
  inquiryThreadSources,
  inquiryThreads,
  studentWork,
} from "../drizzle/schema";
import { getAssignmentContext, getDb } from "./db";
import {
  CANONICAL_ASSIGNMENT_ID,
  CANONICAL_COURSE_ID,
  CANONICAL_STUDENT_PROFILE_ID,
  CANONICAL_WORKSPACE_ID,
  resolveAssignmentId,
} from "./assignmentConstants";
import {
  ADAPTIVE_DIALOGUE_BEHAVIOURAL_POLICY,
  buildAdaptiveDialogueInstruction,
  getQualifiedDevelopmentGraphContext,
  isRestrictedAiSupportRequest,
  STAGE3_LLM_MODEL,
} from "./stage3Services";
import { resolveAiPolicyContextForAssignment } from "./assignmentContextResolvers";
import { invokeLLM } from "./_core/llm";

export type InquiryScaffoldMove =
  | "clarify_question"
  | "layer_explanation"
  | "surface_tensions"
  | "compare_perspectives"
  | "interrogate_sources"
  | "synthesize_and_reflect";

export type InquiryResponseMode =
  | "explain"
  | "compare"
  | "brainstorm"
  | "research_plan"
  | "assignment_analysis"
  | "policy_boundary"
  | "unavailable";

export type InquirySuggestedChoice = {
  id: string;
  label: string;
  prompt: string;
};

type InquiryGeneratedResponse = {
  responseMode?: InquiryResponseMode;
  scaffoldMove: InquiryScaffoldMove;
  body: string;
  suggestedChoices: InquirySuggestedChoice[];
  sourceMaterialIds: string[];
  requiresCurrentSources?: boolean;
  temporarilyUnavailable?: boolean;
};

export const INQUIRY_POLICY_TEXT =
  "Inquiry Studio is for broad conceptual exploration, research interrogation, and structured thinking. Fiosra can explain ideas, surface tensions, compare perspectives, and interrogate sources. It will not write your assignment, draft submission paragraphs, choose your final recommendation, or evaluate your academic capability.";

export function isRestrictedInquiryRequest(promptText: string): boolean {
  return isRestrictedAiSupportRequest(promptText);
}

export function parseInquiryModelOutput(
  raw: string,
  availableSources: Array<{ id: string; title: string }>
): InquiryGeneratedResponse {
  const moveMatch = raw.match(/Move:\s*<?([a-z_]+)>?/i);
  const rawMove = moveMatch?.[1]?.toLowerCase() as InquiryScaffoldMove | undefined;
  const scaffoldMove: InquiryScaffoldMove = [
    "clarify_question",
    "layer_explanation",
    "surface_tensions",
    "compare_perspectives",
    "interrogate_sources",
    "synthesize_and_reflect",
  ].includes(rawMove || "")
    ? (rawMove as InquiryScaffoldMove)
    : "surface_tensions";

  // Strip Move metadata line if present
  let body = raw.replace(/^Move:\s*<?[a-z_]+>?\s*\n+/i, "").trim();

  // Source metadata is intentionally removed from the visible conversation.
  // The UI exposes only an explicit attributed chip for each listed material.
  const sourceMatch = body.match(/(?:^|\n)SOURCES:\s*([\s\S]*?)(?=\nCHOICES:|$)/i);
  const sourceMaterialIds = sourceMatch
    ? sourceMatch[1]
        .split("\n")
        .map((line) => line.replace(/^[-*\d.]+\s*/, "").trim())
        .map((listedTitle) => availableSources.find((source) => source.title.toLowerCase() === listedTitle.toLowerCase())?.id)
        .filter((id): id is string => Boolean(id))
    : [];

  if (sourceMatch) {
    body = body.replace(sourceMatch[0], "").trim();
  }

  // Extract structured choices block if provided by the model
  const choicesMatch = body.match(/CHOICES:\s*([\s\S]+)$/i);
  let suggestedChoices: InquirySuggestedChoice[] = [];
  if (choicesMatch) {
    const choicesBlock = choicesMatch[1];
    body = body.slice(0, choicesMatch.index).trim();
    const lines = choicesBlock
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.startsWith("-") || l.startsWith("*") || /^\d+\./.test(l));

    suggestedChoices = lines.slice(0, 3).map((line, idx) => {
      const clean = line.replace(/^[-*\d.]+\s*/, "").trim();
      const [labelPart, promptPart] = clean.includes("::")
        ? clean.split("::").map((s) => s.trim())
        : [clean.slice(0, 48), clean];
      return {
        id: `choice_${idx + 1}`,
        label: labelPart || `Path ${idx + 1}`,
        prompt: promptPart || clean,
      };
    });
  }

  return { scaffoldMove, body, suggestedChoices, sourceMaterialIds };
}

function selectFallbackSources(
  availableSources: Array<{ id: string; title: string }>,
  titlePattern: RegExp
) {
  return availableSources.filter((source) => titlePattern.test(source.title)).map((source) => source.id);
}

/**
 * Maintains a useful, case-specific inquiry path if the model provider is
 * temporarily unavailable. The fallback is deliberately not a canned response:
 * each recognised intellectual direction has its own case-grounded explanation,
 * question, and controlled-source attribution. It never chooses an option or
 * drafts assignment prose.
 */
function buildDeterministicInquiryFallbackBase(
  studentPrompt: string,
  availableSources: Array<{ id: string; title: string }>
): InquiryGeneratedResponse {
  const prompt = studentPrompt.toLowerCase();
  const has = (pattern: RegExp) => pattern.test(prompt);

  if (has(/avenues|anything you can help|what can you help|where.*start|build.*strategy|strategy.*scale|explore.*assignment/)) {
    return {
      scaffoldMove: "clarify_question",
      body: `There are several productive ways into this assignment. You can frame the decision itself, compare the three growth paths against explicit criteria, test a claim with the supplied case evidence, or examine an assumption that could make an attractive option less feasible. The point is not to rush toward an answer, but to decide which uncertainty is worth resolving first.\n\nWould you rather begin by defining the core dilemma, setting comparison criteria, or testing a specific option?`,
      suggestedChoices: [
        { id: "choice_start_dilemma", label: "Frame the dilemma", prompt: "What is the core strategic dilemma Atlantic Edge Foods is trying to resolve?" },
        { id: "choice_start_criteria", label: "Set comparison criteria", prompt: "Which decision criteria would let me compare the three options fairly?" },
        { id: "choice_start_option", label: "Test an option", prompt: "What evidence would help me test the national-retail option before drawing a conclusion?" },
      ],
      sourceMaterialIds: selectFallbackSources(availableSources, /Framing Strategic Decisions|Comparing Alternatives/),
    };
  }

  if (has(/teach me.*economics|economics|economic concept|financial concept/)) {
    return {
      scaffoldMove: "layer_explanation",
      body: `The economic questions in this case are practical rather than abstract. Gross margin asks what remains after direct costs; working capital concerns the cash tied up between paying suppliers and receiving customer payment; and operating leverage describes how fixed commitments can magnify the effect of a slower revenue ramp. These concepts matter because the three growth paths place pressure on them in different ways.\n\nWhich would be most useful to unpack first: margin, working capital, or the financial effect of a capacity investment?`,
      suggestedChoices: [
        { id: "choice_econ_margin", label: "Understand margin", prompt: "How does gross margin affect the comparison between national retail and the other options?" },
        { id: "choice_econ_working_capital", label: "Understand working capital", prompt: "What does working capital mean in the context of the Great Britain payment terms?" },
        { id: "choice_econ_operating_leverage", label: "Understand fixed commitments", prompt: "How could the national capacity investment change Atlantic Edge Foods' financial risk?" },
      ],
      sourceMaterialIds: selectFallbackSources(availableSources, /Enterprise Profile|Three Competing Strategic Options/),
    };
  }

  if (has(/(should|could|would).*expand.*\buk\b|\buk\b.*(should|could|would).*expand|expand.*great britain|great britain.*expand/)) {
    return {
      scaffoldMove: "surface_tensions",
      body: `The Great Britain proposal should be treated as a different risk profile, not as a simple yes-or-no expansion decision. It preserves premium pricing and needs relatively modest initial capital, but it stretches the cash-conversion cycle to 90 days and places a short-life chilled product into a border-controlled transit route. Whether that trade-off is proportionate depends on financing resilience and the operational safeguards available when shipments are delayed.\n\nWhich uncertainty would you need to reduce first before you could assess the Great Britain route fairly: cash exposure, transit reliability, or demand quality?`,
      suggestedChoices: [
        { id: "choice_uk_first_cash", label: "Reduce cash uncertainty", prompt: "What would I need to know about financing headroom before assessing the Great Britain route?" },
        { id: "choice_uk_first_transit", label: "Reduce transit uncertainty", prompt: "What evidence would help test the transit reliability of the Great Britain route?" },
        { id: "choice_uk_first_demand", label: "Reduce demand uncertainty", prompt: "What would show that the Great Britain demand opportunity is sufficiently dependable?" },
      ],
      sourceMaterialIds: selectFallbackSources(availableSources, /Commercial Channels|Three Competing Strategic Options/),
    };
  }

  // These routes correspond to the immediate inquiry paths suggested by
  // Fiosra. They are deliberately evaluated before their broader parent
  // category so a student who follows a prompt receives a genuine next move,
  // not the answer that originally introduced the prompt.
  if (has(/core (strategic )?dilemma|dilemma.*(resolve|trying)|what.*trying to resolve/)) {
    return {
      scaffoldMove: "clarify_question",
      body: `Atlantic Edge Foods is trying to grow without weakening the conditions that make its premium position viable. The tension is not simply growth versus no growth: higher volume can require lower-margin terms, new capital, more working capital, or more fragile operational and supplier commitments. The three options distribute those pressures differently.\n\nWhich constraint should be treated as non-negotiable before the board compares the growth opportunities?`,
      suggestedChoices: [
        { id: "choice_dilemma_margin", label: "Set a margin floor", prompt: "What would make margin protection a non-negotiable decision criterion for Atlantic Edge Foods?" },
        { id: "choice_dilemma_resilience", label: "Set a resilience condition", prompt: "Which operational resilience condition should the board refuse to compromise?" },
        { id: "choice_dilemma_commitment", label: "Set a commitment limit", prompt: "Which capital or commercial commitment would be hardest for Atlantic Edge Foods to reverse?" },
      ],
      sourceMaterialIds: selectFallbackSources(availableSources, /Framing Strategic Decisions|Enterprise Profile|Three Competing Strategic Options/),
    };
  }

  if (has(/decision criteria|criteria.*(compare|fair)|compare.*fairly|which criteria/)) {
    return {
      scaffoldMove: "layer_explanation",
      body: `A fair comparison needs criteria that reveal more than projected revenue. The course materials suggest testing strategic alignment, resource feasibility, and downside asymmetry. In this case, those can become concrete questions about margin quality, working-capital headroom, capacity reliability, supplier resilience, and how easily a commitment could be unwound.\n\nWhich two or three criteria would most clearly expose a difference between the options, rather than simply describing them?`,
      suggestedChoices: [
        { id: "choice_criteria_feasibility", label: "Define feasibility", prompt: "How should I assess management, cash, and operational feasibility across the options?" },
        { id: "choice_criteria_alignment", label: "Define alignment", prompt: "How does each option fit Atlantic Edge Foods' existing strengths and brand position?" },
        { id: "choice_criteria_downside", label: "Define downside", prompt: "What downside case would show which option is least resilient if it underperforms?" },
      ],
      sourceMaterialIds: selectFallbackSources(availableSources, /Framing Strategic Decisions|Comparing Alternatives/),
    };
  }

  if (has(/management.*cash.*operational.*feasibility|resource feasibility|operational feasibility|management.*feasibility/)) {
    return {
      scaffoldMove: "compare_perspectives",
      body: `Resource feasibility asks whether the firm can carry the option in practice, not whether the option is attractive in principle. National retail requires rapid equipment expansion and dependable fulfilment; Great Britain keeps capital outlay lower but extends the cash-conversion cycle; regional consolidation uses cash reserves to improve the existing operating system. The comparison should therefore include management bandwidth, financing capacity, and the reliability of the operating model under pressure.\n\nWhich of those resource demands would be most difficult for Atlantic Edge Foods to absorb if the expected revenue arrived later than planned?`,
      suggestedChoices: [
        { id: "choice_feasibility_delay", label: "Stress a revenue delay", prompt: "How would a slower-than-expected revenue ramp change the feasibility of each option?" },
        { id: "choice_feasibility_cash", label: "Compare financing needs", prompt: "How do the financing demands differ between the national and Great Britain options?" },
        { id: "choice_feasibility_management", label: "Examine execution load", prompt: "Which option places the greatest execution burden on a 34-person business?" },
      ],
      sourceMaterialIds: selectFallbackSources(availableSources, /Enterprise Profile|Three Competing Strategic Options/),
    };
  }

  if (has(/strategic alignment|current strengths|brand position|brand equity|fit.*strength/)) {
    return {
      scaffoldMove: "compare_perspectives",
      body: `Strategic alignment is about whether an option extends the capabilities Atlantic Edge Foods already performs credibly. The business has premium products, skilled processing staff, long-standing organic suppliers, and high-margin D2C activity. National retail may broaden reach but changes the commercial model; Great Britain extends premium distribution but adds border and cash complexity; regional consolidation deepens current capabilities.\n\nWhich existing strength would each option depend on most heavily, and which option might stretch that strength beyond its current form?`,
      suggestedChoices: [
        { id: "choice_alignment_national", label: "Test national fit", prompt: "How might national retail change Atlantic Edge Foods' premium positioning?" },
        { id: "choice_alignment_uk", label: "Test Great Britain fit", prompt: "Which existing capabilities make selective Great Britain distribution plausible?" },
        { id: "choice_alignment_regional", label: "Test regional fit", prompt: "How does regional consolidation build on Atlantic Edge Foods' existing strengths?" },
      ],
      sourceMaterialIds: selectFallbackSources(availableSources, /Enterprise Profile|Commercial Channels|Three Competing Strategic Options/),
    };
  }

  if (has(/downside.*case|least resilient|underperform|downside asymmetry|worst.?case/)) {
    return {
      scaffoldMove: "interrogate_sources",
      body: `A useful downside case is one that tests whether the business can recover, rather than one that merely makes the option look unattractive. For national retail, lower-than-expected volume could leave a €620,000 capacity commitment and lower-margin sales. For Great Britain, delayed receipts and disrupted chilled transit could combine. For regional consolidation, the major downside is foregone strategic position rather than immediate solvency pressure.\n\nWhich underperformance scenario would create the most irreversible consequence for the firm, and what evidence would you need to judge its likelihood?`,
      suggestedChoices: [
        { id: "choice_downside_national", label: "Stress national retail", prompt: "What would a downside scenario for the national retailer rollout need to include?" },
        { id: "choice_downside_uk", label: "Stress Great Britain", prompt: "How could delayed payments and transit disruption combine in a Great Britain downside case?" },
        { id: "choice_downside_regional", label: "Stress opportunity cost", prompt: "How should I test the downside of forgoing a national market position?" },
      ],
      sourceMaterialIds: selectFallbackSources(availableSources, /Comparing Alternatives|Three Competing Strategic Options/),
    };
  }

  if (has(/margin quality|compare.*29\.5|29\.5.*(margin|retail)|gross margins?.*(regional|uk|national)|economics/)) {
    return {
      scaffoldMove: "layer_explanation",
      body: `The economics need to separate revenue growth from contribution quality. Atlantic Edge Foods currently earns a 36.2% overall gross margin, with 38% in regional retail and 54% in D2C. The national listing would add revenue at a projected 29.5% gross margin after the requested discount. Great Britain retains premium pricing, but its longer payment terms create a financing cost that a simple gross-margin comparison would miss.\n\nWhat additional cost or cash-flow effect would you include before deciding whether a lower-margin growth route is economically attractive?`,
      suggestedChoices: [
        { id: "choice_margin_cost", label: "Include hidden costs", prompt: "Which costs beyond gross margin should I include when comparing the national and Great Britain routes?" },
        { id: "choice_margin_volume", label: "Test volume quality", prompt: "How should I decide whether higher revenue compensates for lower margin quality?" },
        { id: "choice_margin_d2c", label: "Compare with D2C", prompt: "What does the 54% D2C margin contribute to the regional-consolidation case?" },
      ],
      sourceMaterialIds: selectFallbackSources(availableSources, /Enterprise Profile|Commercial Channels|Three Competing Strategic Options/),
    };
  }

  if (has(/concentration|single.?customer|28%|unwind|reversib|difficult.*commitment|hard.*reverse/)) {
    return {
      scaffoldMove: "surface_tensions",
      body: `Commercial concentration and reversibility are linked, but they are not the same risk. A national listing could make one customer responsible for about 28% of firm revenue, while the associated equipment investment and fulfilment obligation increase the cost of changing course. A diversified customer base may reduce dependence on one buyer, yet it can still create financing and logistical exposure.\n\nWhich commitment would make Atlantic Edge Foods least able to adapt if the commercial relationship or market conditions changed?`,
      suggestedChoices: [
        { id: "choice_commitment_equipment", label: "Examine equipment commitment", prompt: "Why might the €620,000 equipment investment be difficult to unwind?" },
        { id: "choice_commitment_customer", label: "Examine buyer dependence", prompt: "How should a 28% single-customer exposure affect the decision criteria?" },
        { id: "choice_commitment_contract", label: "Examine contract terms", prompt: "Which contract terms could reduce or increase the reversibility of the national option?" },
      ],
      sourceMaterialIds: selectFallbackSources(availableSources, /Three Competing Strategic Options|Framing Strategic Decisions/),
    };
  }

  if (has(/revenue delay|slower.*ramp|ramp.?up|operating conditions|manageable|demand.*(late|before)|execution burden/)) {
    return {
      scaffoldMove: "interrogate_sources",
      body: `A slower ramp changes the nature of the capacity decision. If equipment, staffing, or supplier commitments are made before volume is dependable, the firm carries fixed costs and fulfilment exposure without the expected revenue. The case therefore calls for leading indicators, such as confirmed demand, commissioning reliability, available supplier volume, and the cash buffer available during the transition.\n\nWhich leading indicator would you need to see before treating the national capacity expansion as executable rather than merely desirable?`,
      suggestedChoices: [
        { id: "choice_ramp_demand", label: "Test demand certainty", prompt: "What would count as sufficiently dependable demand before committing to extra capacity?" },
        { id: "choice_ramp_supply", label: "Test supply readiness", prompt: "How could supplier reliability be tested before national volume is committed?" },
        { id: "choice_ramp_cash", label: "Test transition cash", prompt: "What cash buffer would need to be considered during a capacity ramp-up?" },
      ],
      sourceMaterialIds: selectFallbackSources(availableSources, /Enterprise Profile|Three Competing Strategic Options|Comparing Alternatives/),
    };
  }

  if (has(/winter organic|salmon availability|fish cost|cost exposure|supplier relationship|artisan supplier|leading indicator.*supply/)) {
    return {
      scaffoldMove: "interrogate_sources",
      body: `The supply question has three distinct dimensions: volume availability, cost volatility, and relationship resilience. Winter storms could limit local organic fish precisely when a high-volume national commitment needs reliable inputs. Because fish is 44% of cost of goods sold, even a modest increase in cost could change the economics of a lower-margin route. Existing supplier relationships may also be an asset that a more volatile volume profile puts under pressure.\n\nWhich of those supply dimensions is most material to the option you are investigating, and how could it be tested before committing?`,
      suggestedChoices: [
        { id: "choice_supply_test_volume", label: "Test seasonal volume", prompt: "What evidence would show whether winter organic salmon volume is reliably available?" },
        { id: "choice_supply_test_cost", label: "Test cost sensitivity", prompt: "How could I test the effect of a higher fish cost on each option?" },
        { id: "choice_supply_test_relationship", label: "Test relationship resilience", prompt: "What would show whether existing supplier relationships can support a more volatile demand profile?" },
      ],
      sourceMaterialIds: selectFallbackSources(availableSources, /Enterprise Profile|Three Competing Strategic Options/),
    };
  }

  if (has(/30.?day.*90.?day|cash timing|financing needs|cash.?conversion|payment terms|debtor terms|delayed payment/)) {
    return {
      scaffoldMove: "layer_explanation",
      body: `Moving from 30-day domestic terms to 90-day distributor terms lengthens the period in which Atlantic Edge Foods has paid for production and shipping but has not yet collected the sale. The case estimates that this requires an additional €180,000 revolving working-capital facility. The key analytical point is to connect the timing gap to the firm's capacity to finance it if sales, collections, or transit do not proceed as planned.\n\nWhat would you need to know about cash reserves, borrowing headroom, and payment reliability before calling that financing requirement manageable?`,
      suggestedChoices: [
        { id: "choice_cash_headroom", label: "Test borrowing headroom", prompt: "What would I need to know about borrowing headroom to assess the €180,000 facility?" },
        { id: "choice_cash_collection", label: "Test collection reliability", prompt: "How would late payment by the distributor change the Great Britain risk profile?" },
        { id: "choice_cash_compare", label: "Compare cash commitments", prompt: "How does the Great Britain working-capital requirement differ from the national capacity investment?" },
      ],
      sourceMaterialIds: selectFallbackSources(availableSources, /Three Competing Strategic Options/),
    };
  }

  if (has(/border checks|shelf life|chilled transit|sps|transit disruption|export.*risk/)) {
    return {
      scaffoldMove: "interrogate_sources",
      body: `The Great Britain route depends on a time-sensitive operating chain. The product has an 18-day chilled shelf life, so SPS checks are not merely a regulatory inconvenience: a delay could reduce saleable life, disrupt the distributor relationship, and potentially create waste or claims. The operational question is whether those risks can be measured, mitigated, and absorbed within the route's premium economics.\n\nWhich transit assumption would you test first: expected border delay, the remaining shelf life on arrival, or the contingency available when a shipment is held?`,
      suggestedChoices: [
        { id: "choice_transit_delay", label: "Test border delay", prompt: "What evidence would help estimate realistic SPS border delays for chilled goods?" },
        { id: "choice_transit_life", label: "Test shelf-life buffer", prompt: "How much shelf-life buffer would make the Great Britain route more resilient?" },
        { id: "choice_transit_contingency", label: "Test contingency", prompt: "What contingency arrangements could mitigate a delayed chilled shipment?" },
      ],
      sourceMaterialIds: selectFallbackSources(availableSources, /Commercial Channels|Three Competing Strategic Options/),
    };
  }

  if (has(/opportunity cost|declining.*national|regional.*resilien|resilience claim|12\.8|ebitda.*(option|regional)|d2c margin/)) {
    return {
      scaffoldMove: "compare_perspectives",
      body: `Regional consolidation offers a different form of progress: it uses a €240,000 investment to remove operational friction while expanding activities that already fit the firm, including D2C and regional channels. Its projected EBITDA improvement to 12.8% signals a stronger margin and resilience case, but the commercial cost is the possibility that a competitor secures the national opportunity first. The decision therefore turns on the value of a robust internal platform relative to a scarce external growth window.\n\nWhat evidence would help you judge whether the national opportunity is truly scarce enough to outweigh the resilience benefit of regional consolidation?`,
      suggestedChoices: [
        { id: "choice_regional_scarcity", label: "Test market scarcity", prompt: "What would show that the national-retail opportunity is difficult to replace later?" },
        { id: "choice_regional_ebitda", label: "Test EBITDA claim", prompt: "Which assumptions sit behind the projected 12.8% EBITDA outcome?" },
        { id: "choice_regional_d2c", label: "Test D2C contribution", prompt: "How does growth in high-margin D2C change the regional-consolidation comparison?" },
      ],
      sourceMaterialIds: selectFallbackSources(availableSources, /Enterprise Profile|Commercial Channels|Three Competing Strategic Options/),
    };
  }

  if (has(/evidence|support|challenge|prove|test this|data gap|missing data|uncertain/)) {
    return {
      scaffoldMove: "interrogate_sources",
      body: `Treat this as an evidence test rather than a search for a reassuring fact. For the Great Britain route, the decisive evidence concerns whether the estimated €180,000 working-capital facility and the chilled-transit assumptions are realistic. For national retail, the key tests concern whether the €620,000 capacity investment can reliably protect 99.2% fulfilment while the lower 29.5% margin still absorbs downside variation.\n\nWhich assumption, if it proved wrong, would most change the comparison you are making?`,
      suggestedChoices: [
        {
          id: "choice_evidence_uk",
          label: "Test UK cash exposure",
          prompt: "What evidence would let me test the €180,000 working-capital estimate for the Great Britain route?",
        },
        {
          id: "choice_evidence_capacity",
          label: "Test fulfilment resilience",
          prompt: "What evidence would show whether Atlantic Edge can sustain 99.2% on-time fulfilment after a national rollout?",
        },
        {
          id: "choice_evidence_downside",
          label: "Define a downside case",
          prompt: "Which downside scenario would best reveal the difference between the three options?",
        },
      ],
      sourceMaterialIds: selectFallbackSources(availableSources, /Comparing Alternatives|Three Competing Strategic Options/),
    };
  }

  if (has(/88%|capacity|bottleneck|smokehouse|production|fulfilment|fulfillment|kiln|packaging/)) {
    return {
      scaffoldMove: "layer_explanation",
      body: `The 88% peak-week capacity figure is structural because it constrains the firm's ability to make a reliable commercial promise, not merely its ability to produce more units. Option A turns that constraint into a larger commitment: €620,000 of equipment investment and a 99.2% on-time fulfilment requirement, with penalties if the promise is missed. That joins operational resilience directly to margin and reputation.\n\nWhat would have to be true about demand, equipment ramp-up, and supplier reliability before that commitment became proportionate?`,
      suggestedChoices: [
        {
          id: "choice_capacity_conditions",
          label: "Identify capacity conditions",
          prompt: "Which operating conditions would need to hold for the national retailer requirement to be manageable?",
        },
        {
          id: "choice_capacity_reversibility",
          label: "Compare reversibility",
          prompt: "How reversible is the national capacity investment compared with the other two options?",
        },
        {
          id: "choice_capacity_downside",
          label: "Stress a late ramp-up",
          prompt: "What happens if demand arrives before the new capacity is fully reliable?",
        },
      ],
      sourceMaterialIds: selectFallbackSources(availableSources, /Enterprise Profile|Three Competing Strategic Options/),
    };
  }

  if (has(/salmon|supplier|supply|winter|fish cost|aquaculture|storm/)) {
    return {
      scaffoldMove: "interrogate_sources",
      body: `Supply reliability matters here because fish represents 44% of Atlantic Edge Foods' cost of goods sold and the business depends on long-term organic aquaculture relationships. The national rollout increases volume pressure precisely where the case notes that winter storms may constrain local organic supply. The strategic question is therefore not simply whether more fish can be bought, but whether supply can remain reliable and traceable when fulfilment penalties apply.\n\nWhich supplier constraint would you treat as a leading indicator of risk before committing to higher-volume demand?`,
      suggestedChoices: [
        {
          id: "choice_supply_volume",
          label: "Test winter volume",
          prompt: "What would I need to know about winter organic salmon availability before considering a higher-volume option?",
        },
        {
          id: "choice_supply_cost",
          label: "Test cost exposure",
          prompt: "How would a change in fish cost affect the economics of the three options?",
        },
        {
          id: "choice_supply_relationships",
          label: "Consider supplier relationships",
          prompt: "How should existing artisan supplier relationships feature in the decision criteria?",
        },
      ],
      sourceMaterialIds: selectFallbackSources(availableSources, /Enterprise Profile|Three Competing Strategic Options/),
    };
  }

  if (has(/90.?day|debtor|working capital|cash.?flow|cash position|settlement|payment term|receivable|great britain|uk route|britain|sps|border|transit/)) {
    return {
      scaffoldMove: "surface_tensions",
      body: `The Great Britain partnership preserves premium pricing and requires only €110,000 of export and shipping preparation, but it changes the timing of cash. Its 90-day payment terms are materially longer than the current 30-day domestic terms, and the case estimates a €180,000 increase in the revolving working-capital facility. At the same time, SPS border checks create a separate operational risk for an 18-day chilled product.\n\nHow would you distinguish a manageable financing requirement from a cash-flow exposure that changes the option's overall risk?`,
      suggestedChoices: [
        {
          id: "choice_uk_cash",
          label: "Examine cash timing",
          prompt: "How should I analyse the effect of moving from 30-day to 90-day payment terms?",
        },
        {
          id: "choice_uk_transit",
          label: "Examine chilled transit",
          prompt: "What assumptions about border checks and shelf life would the Great Britain route depend on?",
        },
        {
          id: "choice_uk_compare",
          label: "Compare risk types",
          prompt: "How do working-capital risk and customer-concentration risk differ as decision criteria?",
        },
      ],
      sourceMaterialIds: selectFallbackSources(availableSources, /Three Competing Strategic Options|Commercial Channels/),
    };
  }

  if (has(/national|supermarket|tier.?1|29\.5|margin|discount|1\.9m|scale|rollout|concentration/)) {
    return {
      scaffoldMove: "compare_perspectives",
      body: `National retail offers a substantial revenue step, projected at €1.9m in year one, but the comparison cannot stop at turnover. The 8% discount reduces gross margin on that volume to 29.5%, below Atlantic Edge Foods' current 36.2% overall margin, while one customer would represent about 28% of firm revenue. The option therefore combines scale, capital investment, margin dilution, and commercial concentration in one commitment.\n\nWhich of those effects should have the greatest weight in your decision criteria, and why?`,
      suggestedChoices: [
        {
          id: "choice_national_margin",
          label: "Examine margin quality",
          prompt: "How should I compare a 29.5% national-retail margin with Atlantic Edge Foods' existing margin profile?",
        },
        {
          id: "choice_national_concentration",
          label: "Examine concentration",
          prompt: "How should a 28% single-customer exposure affect the comparison?",
        },
        {
          id: "choice_national_reversibility",
          label: "Examine commitment",
          prompt: "Which parts of the national-retail commitment would be difficult to unwind if conditions changed?",
        },
      ],
      sourceMaterialIds: selectFallbackSources(availableSources, /Enterprise Profile|Three Competing Strategic Options/),
    };
  }

  if (has(/regional|consolidation|d2c|resilience|12\.8|cash reserve|7%|organic growth/)) {
    return {
      scaffoldMove: "compare_perspectives",
      body: `Regional consolidation is not simply the cautious option. It directs €240,000 toward packaging efficiency, flash-chilling, and higher-margin regional, food-service, and D2C activity, while the case projects EBITDA to rise from 10.1% to 12.8%. Its trade-off is strategic opportunity cost: the firm forgoes a prominent national position and competitors may take that slot.\n\nHow would you weigh resilience and margin protection against the value of securing a more visible growth platform now?`,
      suggestedChoices: [
        {
          id: "choice_regional_opportunity",
          label: "Test opportunity cost",
          prompt: "What would Atlantic Edge Foods give up by declining the national-retail opportunity?",
        },
        {
          id: "choice_regional_resilience",
          label: "Test resilience claim",
          prompt: "What makes the regional-consolidation option operationally more resilient?",
        },
        {
          id: "choice_regional_margin",
          label: "Compare margin paths",
          prompt: "How should I compare the projected 12.8% EBITDA outcome with the growth offered by Options A and B?",
        },
      ],
      sourceMaterialIds: selectFallbackSources(availableSources, /Enterprise Profile|Three Competing Strategic Options|Commercial Channels/),
    };
  }

  if (has(/risk|trade.?off|compare|alternative|option|decision criteria|less risky|uncertainty/)) {
    return {
      scaffoldMove: "surface_tensions",
      body: `The case presents different kinds of exposure rather than one simple risk ranking. National retail concentrates revenue and requires rapid capacity investment; Great Britain distributes customers but extends cash conversion and adds chilled-border uncertainty; regional consolidation protects resilience but may sacrifice a scarce growth position. A useful comparison separates strategic alignment, resource feasibility, and downside asymmetry instead of collapsing them into one label.\n\nWhich risk matters most because it would be hardest for Atlantic Edge Foods to recover from if the option underperformed?`,
      suggestedChoices: [
        {
          id: "choice_compare_alignment",
          label: "Compare strategic alignment",
          prompt: "How does each option fit Atlantic Edge Foods' current strengths and brand position?",
        },
        {
          id: "choice_compare_feasibility",
          label: "Compare resource feasibility",
          prompt: "How should I assess management, cash, and operational feasibility across the options?",
        },
        {
          id: "choice_compare_downside",
          label: "Compare downside asymmetry",
          prompt: "What downside case would show which option is least resilient if it underperforms?",
        },
      ],
      sourceMaterialIds: selectFallbackSources(availableSources, /Comparing Alternatives|Three Competing Strategic Options/),
    };
  }

  return {
    scaffoldMove: "clarify_question",
    body: `A useful way to begin is to turn the broad growth question into a decision that can be tested. Atlantic Edge Foods is not deciding whether growth is good; it is deciding what combination of scale, margin, cash exposure, operational resilience, and supplier relationships it can sustain. Defining those criteria before comparing options keeps the inquiry open rather than assuming that the largest revenue projection is decisive.\n\nWhich part of the growth problem feels least clear to you: the decision criteria, the evidence available, or the trade-off between the options?`,
    suggestedChoices: [
      {
        id: "choice_frame_dilemma",
        label: "Frame the core dilemma",
        prompt: "What is the core strategic dilemma Atlantic Edge Foods is trying to resolve?",
      },
      {
        id: "choice_define_criteria",
        label: "Define criteria",
        prompt: "Which decision criteria would let me compare the three options fairly?",
      },
      {
        id: "choice_map_evidence",
        label: "Map evidence gaps",
        prompt: "What evidence would I need before drawing a conclusion about the options?",
      },
    ],
    sourceMaterialIds: selectFallbackSources(availableSources, /Framing Strategic Decisions|Comparing Alternatives/),
  };
}

function normalizeInquiryResponse(text: string) {
  return text.toLowerCase().replace(/\s+/g, " ").replace(/[^a-z0-9€ ]/g, "").trim();
}

function buildInquiryProgressionGuard(
  studentPrompt: string,
  availableSources: Array<{ id: string; title: string }>
): InquiryGeneratedResponse {
  const focusedPrompt = studentPrompt.replace(/\s+/g, " ").trim().slice(0, 180);
  return {
    scaffoldMove: "synthesize_and_reflect",
    body: `That returns to a question already in play, so it is more useful to make the next distinction rather than repeat the earlier explanation. For the claim you are testing, separate what the case states directly from the condition that would have to hold for the claim to remain persuasive. In Atlantic Edge Foods, that distinction is often between projected opportunity and the cash, capacity, transit, or supplier resilience needed to realise it.\n\nFor “${focusedPrompt}”, which single assumption would you investigate first, and what observation would make you revise your view?`,
    suggestedChoices: [
      { id: "choice_progression_assumption", label: "Identify an assumption", prompt: "What is the most important assumption behind the point I have just raised?" },
      { id: "choice_progression_evidence", label: "Identify evidence", prompt: "What case evidence would most directly test that assumption?" },
      { id: "choice_progression_countercase", label: "Consider a counter-case", prompt: "What plausible counter-case would challenge this line of reasoning?" },
    ],
    sourceMaterialIds: selectFallbackSources(availableSources, /Framing Strategic Decisions|Comparing Alternatives|Three Competing Strategic Options/),
  };
}

/**
 * Provides a bounded, case-specific response when model output is unavailable.
 * Recent Fiosra bodies are included only to prevent the same visible prose from
 * being stored twice in a row, including after a student follows a suggested
 * prompt that overlaps with the current topic.
 */
export function buildDeterministicInquiryFallback(
  studentPrompt: string,
  availableSources: Array<{ id: string; title: string }>,
  recentFiosraBodies: string[] = []
): InquiryGeneratedResponse {
  const response = buildDeterministicInquiryFallbackBase(studentPrompt, availableSources);
  const normalizedResponse = normalizeInquiryResponse(response.body);
  const hasRecentDuplicate = recentFiosraBodies.some(
    (body) => normalizeInquiryResponse(body) === normalizedResponse
  );

  return hasRecentDuplicate
    ? buildInquiryProgressionGuard(studentPrompt, availableSources)
    : response;
}

export async function getInquiryStudioOverview(studentProfileId = CANONICAL_STUDENT_PROFILE_ID) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const threads = await db
    .select()
    .from(inquiryThreads)
    .where(and(eq(inquiryThreads.studentProfileId, studentProfileId), eq(inquiryThreads.state, "active")))
    .orderBy(desc(inquiryThreads.updatedAt));

  const notes = await db
    .select()
    .from(inquiryNotes)
    .where(eq(inquiryNotes.studentProfileId, studentProfileId))
    .orderBy(desc(inquiryNotes.updatedAt));

  const threadTitles = new Map(threads.map((thread) => [thread.id, thread.title]));

  const [course] = await db
    .select({
      id: courses.id,
      code: courses.code,
      title: courses.title,
      discipline: courses.discipline,
    })
    .from(courses)
    .where(eq(courses.id, CANONICAL_COURSE_ID))
    .limit(1);

  const [assignment] = await db
    .select({
      id: assignments.id,
      title: assignments.title,
      status: assignments.status,
    })
    .from(assignments)
    .where(eq(assignments.id, CANONICAL_ASSIGNMENT_ID))
    .limit(1);

  return {
    course,
    activeAssignment: assignment,
    threads,
    notes: notes.map((note) => ({
      ...note,
      threadTitle: threadTitles.get(note.threadId) ?? "Earlier conversation",
    })),
  };
}

async function attachControlledAssignmentSources(threadId: string, assignmentId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const context = await getAssignmentContext(assignmentId);
  for (const mat of context.materials) {
    await db
      .insert(inquiryThreadSources)
      .values({
        id: `inq_src_${threadId}_${mat.id}`,
        threadId,
        academicMaterialId: mat.id,
        sourceKind: "course_material",
        titleSnapshot: mat.title,
        summarySnapshot: mat.summary,
        provenanceLabel:
          mat.materialType === "learning"
            ? "Course Conceptual Note"
            : "Atlantic Edge Foods Decision Case Context",
      })
      .onDuplicateKeyUpdate({
        set: { titleSnapshot: mat.title },
      });
  }

  return context;
}

export async function createInquiryThread(input: {
  studentProfileId?: string;
  scope: "course" | "assignment";
  assignmentId?: string;
  initialQuestion: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const studentProfileId = input.studentProfileId ?? CANONICAL_STUDENT_PROFILE_ID;
  const scope = input.scope;
  const assignmentId = scope === "assignment" ? resolveAssignmentId(input.assignmentId ?? CANONICAL_ASSIGNMENT_ID) : null;
  const initialQuestion = (input.initialQuestion || "").trim();

  if (initialQuestion.length < 5) {
    throw new Error("Please enter a question or topic to investigate.");
  }

  const threadId = `inquiry_thread_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const title =
    initialQuestion.length > 60
      ? `${initialQuestion.slice(0, 57).trim()}…`
      : initialQuestion;

  await db.insert(inquiryThreads).values({
    id: threadId,
    workspaceId: CANONICAL_WORKSPACE_ID,
    courseId: CANONICAL_COURSE_ID,
    assignmentId,
    studentProfileId,
    scope,
    title,
    initialQuestion,
    currentQuestion: initialQuestion,
    state: "active",
  });

  // Post the student's initial opening question
  const studentMessageId = `inq_msg_${Date.now()}_std`;
  await db.insert(inquiryMessages).values({
    id: studentMessageId,
    threadId,
    author: "student",
    messageType: "question",
    content: initialQuestion,
    provenanceJson: JSON.stringify({ origin: "student_prompt" }),
  });

  // Assignment sources become available only after an explicit assignment
  // connection. Open course inquiry begins without case material or trace context.
  if (assignmentId) {
    await attachControlledAssignmentSources(threadId, assignmentId);
  }

  // Generate the first scaffolded response
  const response = await generateInquiryResponse({
    threadId,
    studentPrompt: initialQuestion,
    studentProfileId,
  });

  return {
    threadId,
    title,
    scope,
    firstResponse: response,
  };
}

/**
 * A student-controlled transition from broad course inquiry into a specific
 * assignment context. The link adds controlled sources and provenance only.
 * It does not create Development Evidence, a Developmental Moment, or a trace score.
 */
export async function linkInquiryThreadToAssignment(input: {
  threadId: string;
  assignmentId?: string;
  studentProfileId?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const studentProfileId = input.studentProfileId ?? CANONICAL_STUDENT_PROFILE_ID;
  const targetAssignmentId = resolveAssignmentId(input.assignmentId ?? CANONICAL_ASSIGNMENT_ID);
  const [thread] = await db
    .select()
    .from(inquiryThreads)
    .where(and(eq(inquiryThreads.id, input.threadId), eq(inquiryThreads.studentProfileId, studentProfileId)))
    .limit(1);

  if (!thread) throw new Error("Inquiry thread not found.");

  const context = await getAssignmentContext(targetAssignmentId);
  if (context.assignment.courseId !== thread.courseId) {
    throw new Error("This inquiry can only be linked to an assignment in the same course.");
  }

  await db
    .update(inquiryThreads)
    .set({
      scope: "assignment",
      assignmentId: targetAssignmentId,
      updatedAt: new Date(),
    })
    .where(eq(inquiryThreads.id, thread.id));

  await attachControlledAssignmentSources(thread.id, targetAssignmentId);

  return {
    threadId: thread.id,
    scope: "assignment" as const,
    assignment: { id: context.assignment.id, title: context.assignment.title },
    message: "This inquiry is now connected to the assignment as context for your own later revision. It is not Development Evidence on its own.",
  };
}

export async function getInquiryThreadDetail(threadId: string, studentProfileId = CANONICAL_STUDENT_PROFILE_ID) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const [thread] = await db
    .select()
    .from(inquiryThreads)
    .where(and(eq(inquiryThreads.id, threadId), eq(inquiryThreads.studentProfileId, studentProfileId)))
    .limit(1);

  if (!thread) {
    throw new Error("Inquiry thread not found.");
  }

  const messages = await db
    .select()
    .from(inquiryMessages)
    .where(eq(inquiryMessages.threadId, threadId))
    .orderBy(inquiryMessages.createdAt);

  const sources = await db
    .select()
    .from(inquiryThreadSources)
    .where(eq(inquiryThreadSources.threadId, threadId))
    .orderBy(inquiryThreadSources.createdAt);

  const sourceMaterialIds = sources.map((source) => source.academicMaterialId);
  const sourceMaterials =
    sourceMaterialIds.length > 0
      ? await db
          .select({ id: academicMaterials.id, content: academicMaterials.content })
          .from(academicMaterials)
          .where(inArray(academicMaterials.id, sourceMaterialIds))
      : [];
  const sourceContentById = new Map(sourceMaterials.map((material) => [material.id, material.content]));

  const notes = await db
    .select()
    .from(inquiryNotes)
    .where(eq(inquiryNotes.threadId, threadId))
    .orderBy(desc(inquiryNotes.updatedAt));

  return {
    thread,
    messages: messages.map((m) => ({
      ...m,
      choices: m.choicesJson ? (JSON.parse(m.choicesJson) as InquirySuggestedChoice[]) : [],
    })),
    sources: sources.map((source) => ({
      ...source,
      contentExcerpt: sourceContentById.get(source.academicMaterialId)?.slice(0, 900) ?? source.summarySnapshot,
    })),
    notes,
  };
}

export async function postInquiryMessage(input: {
  threadId: string;
  studentPrompt: string;
  studentProfileId?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const studentProfileId = input.studentProfileId ?? CANONICAL_STUDENT_PROFILE_ID;
  const promptText = (input.studentPrompt || "").trim();

  if (promptText.length < 2) {
    throw new Error("Please enter a response or question.");
  }

  const [thread] = await db
    .select()
    .from(inquiryThreads)
    .where(and(eq(inquiryThreads.id, input.threadId), eq(inquiryThreads.studentProfileId, studentProfileId)))
    .limit(1);

  if (!thread) {
    throw new Error("Inquiry thread not found.");
  }

  // 1. Record student turn
  const studentMsgId = `inq_msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  await db.insert(inquiryMessages).values({
    id: studentMsgId,
    threadId: input.threadId,
    author: "student",
    messageType: "question",
    content: promptText,
    provenanceJson: JSON.stringify({ origin: "student_prompt" }),
  });

  await db
    .update(inquiryThreads)
    .set({ currentQuestion: promptText, updatedAt: new Date() })
    .where(eq(inquiryThreads.id, input.threadId));

  // 2. Generate scaffolded Fiosra turn
  const fiosraResponse = await generateInquiryResponse({
    threadId: input.threadId,
    studentPrompt: promptText,
    studentProfileId,
  });

  return {
    studentMessageId: studentMsgId,
    fiosraResponse,
  };
}

/**
 * Retries an unavailable model response in place. The student's original
 * question remains a single turn in the inquiry record, and retrying does not
 * create Development Evidence, a Developmental Moment, or a trace update.
 */
export async function retryInquiryResponse(input: {
  threadId: string;
  unavailableMessageId: string;
  studentProfileId?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const studentProfileId = input.studentProfileId ?? CANONICAL_STUDENT_PROFILE_ID;
  const [thread] = await db
    .select()
    .from(inquiryThreads)
    .where(and(eq(inquiryThreads.id, input.threadId), eq(inquiryThreads.studentProfileId, studentProfileId)))
    .limit(1);
  if (!thread) throw new Error("Inquiry thread not found.");

  const [unavailableMessage] = await db
    .select()
    .from(inquiryMessages)
    .where(and(eq(inquiryMessages.id, input.unavailableMessageId), eq(inquiryMessages.threadId, input.threadId)))
    .limit(1);
  if (!unavailableMessage || unavailableMessage.author !== "fiosra") {
    throw new Error("The inquiry response is not available to retry.");
  }

  let provenance: { temporarilyUnavailable?: unknown } = {};
  try {
    provenance = JSON.parse(unavailableMessage.provenanceJson) as { temporarilyUnavailable?: unknown };
  } catch {
    // An unparseable historical record is not retriable.
  }
  if (provenance.temporarilyUnavailable !== true) {
    throw new Error("Only an unavailable inquiry response can be retried.");
  }

  const messages = await db
    .select()
    .from(inquiryMessages)
    .where(eq(inquiryMessages.threadId, input.threadId))
    .orderBy(inquiryMessages.createdAt);
  const unavailableIndex = messages.findIndex((message) => message.id === unavailableMessage.id);
  const originalStudentMessage = messages.slice(0, unavailableIndex).reverse().find((message) => message.author === "student");
  if (!originalStudentMessage) throw new Error("The original inquiry question could not be found.");

  return await generateInquiryResponse({
    threadId: input.threadId,
    studentPrompt: originalStudentMessage.content,
    studentProfileId,
    replaceMessageId: unavailableMessage.id,
  });
}

export function buildOpenInquiryUnavailableResponse(): InquiryGeneratedResponse {
  return {
    responseMode: "unavailable",
    scaffoldMove: "clarify_question",
    body: "Fiosra cannot complete an explanation at the moment. Your question has not been added to your Development Trace. You can retry this question, revise it, or return to it later.",
    suggestedChoices: [],
    sourceMaterialIds: [],
    requiresCurrentSources: false,
    temporarilyUnavailable: true,
  };
}

const INQUIRY_RESPONSE_MODES: InquiryResponseMode[] = [
  "explain",
  "compare",
  "brainstorm",
  "research_plan",
  "assignment_analysis",
  "policy_boundary",
];

const inquiryResponseSchema = {
  type: "object",
  properties: {
    responseMode: { type: "string", enum: INQUIRY_RESPONSE_MODES },
    answer: { type: "string" },
    nextMoves: {
      type: "array",
      items: {
        type: "object",
        properties: {
          label: { type: "string" },
          prompt: { type: "string" },
        },
        required: ["label", "prompt"],
        additionalProperties: false,
      },
      maxItems: 2,
    },
    sourceTitles: {
      type: "array",
      items: { type: "string" },
      maxItems: 3,
    },
    requiresCurrentSources: { type: "boolean" },
  },
  required: ["responseMode", "answer", "nextMoves", "sourceTitles", "requiresCurrentSources"],
  additionalProperties: false,
} as const;

function moveForResponseMode(mode: InquiryResponseMode): InquiryScaffoldMove {
  switch (mode) {
    case "explain":
      return "layer_explanation";
    case "compare":
      return "compare_perspectives";
    case "brainstorm":
      return "surface_tensions";
    case "research_plan":
      return "interrogate_sources";
    case "assignment_analysis":
      return "synthesize_and_reflect";
    case "policy_boundary":
      return "clarify_question";
    default:
      return "clarify_question";
  }
}

export function parseStructuredInquiryResponse(
  raw: string,
  availableSources: Array<{ id: string; title: string }>
): InquiryGeneratedResponse | null {
  try {
    const parsed = JSON.parse(raw) as {
      responseMode?: unknown;
      answer?: unknown;
      nextMoves?: unknown;
      sourceTitles?: unknown;
      requiresCurrentSources?: unknown;
    };
    if (
      typeof parsed.answer !== "string" ||
      parsed.answer.trim().length < 24 ||
      typeof parsed.responseMode !== "string" ||
      !INQUIRY_RESPONSE_MODES.includes(parsed.responseMode as InquiryResponseMode) ||
      !Array.isArray(parsed.nextMoves) ||
      !Array.isArray(parsed.sourceTitles) ||
      typeof parsed.requiresCurrentSources !== "boolean"
    ) {
      return null;
    }

    const responseMode = parsed.responseMode as InquiryResponseMode;
    const suggestedChoices = parsed.nextMoves.slice(0, 2).flatMap((move, index) => {
      if (
        !move ||
        typeof move !== "object" ||
        typeof (move as { label?: unknown }).label !== "string" ||
        typeof (move as { prompt?: unknown }).prompt !== "string"
      ) {
        return [];
      }
      const label = (move as { label: string }).label.trim();
      const prompt = (move as { prompt: string }).prompt.trim();
      return label && prompt ? [{ id: `choice_${index + 1}`, label: label.slice(0, 70), prompt: prompt.slice(0, 360) }] : [];
    });

    const sourceMaterialIds = parsed.sourceTitles
      .filter((title): title is string => typeof title === "string")
      .map((title) => availableSources.find((source) => source.title.toLowerCase() === title.toLowerCase())?.id)
      .filter((id): id is string => Boolean(id));

    return {
      responseMode,
      scaffoldMove: moveForResponseMode(responseMode),
      body: parsed.answer.trim().slice(0, 1800),
      suggestedChoices,
      sourceMaterialIds,
      requiresCurrentSources: parsed.requiresCurrentSources,
    };
  } catch {
    return null;
  }
}

async function generateInquiryResponse(input: {
  threadId: string;
  studentPrompt: string;
  studentProfileId: string;
  replaceMessageId?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const [thread] = await db
    .select()
    .from(inquiryThreads)
    .where(eq(inquiryThreads.id, input.threadId))
    .limit(1);

  if (!thread) throw new Error("Thread missing");

  const isAssignmentConnected = thread.scope === "assignment" && Boolean(thread.assignmentId);

  // Check policy boundary first
  const isRestricted = isRestrictedInquiryRequest(input.studentPrompt);
  if (isRestricted) {
    const boundaryText =
      isAssignmentConnected
        ? "Inquiry Studio is an environment for investigation, source comparison, and testing your reasoning. In keeping with course policy, Fiosra cannot draft your assignment, select a recommendation for you, or evaluate your work for grades.\n\nHowever, you can explore the underlying tensions. For example: what trade-offs between cash-flow timing and customer concentration exist across the strategic options?"
        : "Inquiry Studio can help you clarify a concept, test an assumption, compare perspectives, or formulate a research question. It cannot produce submission-ready work, decide a position for you, or evaluate academic work for grades.\n\nYou could instead ask: what would I need to investigate before relying on the claim I have just raised?";
    const boundaryChoices = isAssignmentConnected
      ? [
          {
            id: "choice_explore_tensions",
            label: "Examine trade-offs instead",
            prompt: "What trade-offs between working capital and customer concentration exist in this decision?",
          },
        ]
      : [
          {
            id: "choice_open_boundary_assumption",
            label: "Test an assumption instead",
            prompt: "What would I need to investigate before relying on the claim I have just raised?",
          },
        ];

    const boundaryMsgId = `inq_msg_${Date.now()}_boundary`;
    await db.insert(inquiryMessages).values({
      id: boundaryMsgId,
      threadId: input.threadId,
      author: "fiosra",
      messageType: "policy_boundary",
      content: boundaryText,
      scaffoldMove: "clarify_question",
      choicesJson: JSON.stringify(boundaryChoices),
      provenanceJson: JSON.stringify({ policy: "inquiry_studio_strict_boundary" }),
    });

    return {
      id: boundaryMsgId,
      author: "fiosra" as const,
      messageType: "policy_boundary" as const,
      content: boundaryText,
      scaffoldMove: "clarify_question" as InquiryScaffoldMove,
      choices: boundaryChoices,
    };
  }

  // Assignment context is available only after the student has explicitly linked
  // the thread. A course inquiry remains open and source-free by default.
  const assignmentId = isAssignmentConnected ? thread.assignmentId : null;
  const [context, recentTurns, policyContext, linkedStudentWork] = await Promise.all([
    assignmentId ? getAssignmentContext(assignmentId) : Promise.resolve(null),
    db
      .select({
        author: inquiryMessages.author,
        content: inquiryMessages.content,
      })
      .from(inquiryMessages)
      .where(eq(inquiryMessages.threadId, input.threadId))
      .orderBy(desc(inquiryMessages.createdAt))
      .limit(6),
    assignmentId ? resolveAiPolicyContextForAssignment(assignmentId) : Promise.resolve(null),
    assignmentId
      ? db
          .select({ id: studentWork.id })
          .from(studentWork)
          .where(and(eq(studentWork.assignmentId, assignmentId), eq(studentWork.studentProfileId, input.studentProfileId)))
          .limit(1)
      : Promise.resolve([]),
  ]);
  const assignmentObjectiveCodes: string[] = context?.assignment.learningOutcomeCodesJson
    ? JSON.parse(context.assignment.learningOutcomeCodesJson)
    : [];
  const graphContext = assignmentId && linkedStudentWork[0]
    ? await getQualifiedDevelopmentGraphContext(linkedStudentWork[0].id, "", assignmentObjectiveCodes)
    : "No qualified Development Graph context is available for this open inquiry.";
  const materialsSummary = context
    ? context.materials
        .map((m) => `[${m.title}] (${m.materialType}):\nSummary: ${m.summary}\nContent snippet: ${m.content.slice(0, 360)}...`)
        .join("\n\n")
    : "No assignment materials are connected to this open course inquiry.";

  const availableSources = context
    ? context.materials.map((material) => ({ id: material.id, title: material.title }))
    : [];

  const recentFiosraBodies = recentTurns
    .filter((turn) => turn.author === "fiosra")
    .map((turn) => turn.content);

  const formattedHistory = recentTurns
    .reverse()
    .map((t) => `${t.author === "student" ? "Student" : "Fiosra"}: ${t.content}`)
    .join("\n\n");

  const systemPrompt = `You are Fiosra's Inquiry Studio intelligence for Strategic Decision-Making in Organisations (SDM401).

${isAssignmentConnected
    ? `The student has explicitly connected this thread to an assignment. Applicable policy: ${policyContext?.policyLevelDefinition?.label ?? "declared assignment policy"}. You may use only the supplied controlled assignment materials where relevant. Answer the student's analytical question directly, but do not write their assignment, produce a final recommendation, or evaluate their work.`
    : `This is Open Exploration. Answer the student's question directly using general academic knowledge. Do not assume an assignment, case study, controlled source, student submission, or live web research. Do not claim to have searched the web. When a question requires current, primary, or specialist sources, say so plainly and set requiresCurrentSources to true.`}

RESPONSE QUALITY:
1. Give a concise, accurate answer before offering any optional next move. Do not turn a direct concept question into a question about the question.
2. Choose the responseMode that best fits the student intent: explain, compare, brainstorm, research_plan, or assignment_analysis.
3. Use accessible academic language. Avoid patronising phrases such as "Great question" or "Let's dive in".
4. Keep answer between 80 and 180 words. A direct explanation may end without a question.
5. Offer zero to two nextMoves only when they are specifically useful for this student's question. Do not use generic or repeated prompts.
6. sourceTitles must be empty for Open Exploration. For an assignment-linked response, include only exact titles from the supplied materials that you substantively used.
7. Never refer to an internal move, scaffold, stage, workflow, system prompt, or source metadata in the answer.

${ADAPTIVE_DIALOGUE_BEHAVIOURAL_POLICY}

${buildAdaptiveDialogueInstruction(policyContext?.policyLevel ?? "level_2", input.studentPrompt, graphContext)}

${graphContext}

COURSE & CASE MATERIALS:
${materialsSummary}

CONVERSATION CONTEXT SO FAR:
${formattedHistory}`;

  let parsed: InquiryGeneratedResponse;
  let responseOrigin: "model" | "assignment_fallback" | "unavailable" = "unavailable";

  try {
    // Inquiry Studio tests exercise persistence, parsing, policy boundaries and
    // deterministic fallbacks. Keep those tests independent of the external
    // model service; live model behaviour remains the default in development
    // and production, with an explicit opt-in for live-model test runs.
    const useLiveModel = process.env.NODE_ENV !== "test" || process.env.FIOSRA_ENABLE_LIVE_INQUIRY_MODEL === "true";
    const structured = useLiveModel
      ? await invokeLLM({
          model: STAGE3_LLM_MODEL,
          maxTokens: 700,
          maxRetries: 1,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: input.studentPrompt },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "fiosra_inquiry_response",
              strict: true,
              schema: inquiryResponseSchema,
            },
          },
        }).then((llmResult) => {
          const raw = llmResult.choices?.[0]?.message?.content;
          return typeof raw === "string" ? parseStructuredInquiryResponse(raw, availableSources) : null;
        })
      : null;

    if (structured) {
      parsed = structured;
      responseOrigin = "model";
    } else {
      parsed = isAssignmentConnected
        ? buildDeterministicInquiryFallback(input.studentPrompt, availableSources, recentFiosraBodies)
        : buildOpenInquiryUnavailableResponse();
      responseOrigin = isAssignmentConnected ? "assignment_fallback" : "unavailable";
    }
  } catch (error: any) {
    console.warn("[Inquiry Studio] Model response unavailable; returning transparent availability state:", error?.message);
    parsed = isAssignmentConnected
      ? buildDeterministicInquiryFallback(input.studentPrompt, availableSources, recentFiosraBodies)
      : buildOpenInquiryUnavailableResponse();
    responseOrigin = isAssignmentConnected ? "assignment_fallback" : "unavailable";
  }

  const fiosraMsgId = input.replaceMessageId ?? `inq_msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const persistedMessage = {
    content: parsed.body,
    scaffoldMove: parsed.scaffoldMove,
    choicesJson: parsed.suggestedChoices.length > 0 ? JSON.stringify(parsed.suggestedChoices) : null,
    provenanceJson: JSON.stringify({
      model: STAGE3_LLM_MODEL,
      responseOrigin,
      responseMode: parsed.responseMode ?? (isAssignmentConnected ? "assignment_analysis" : "unavailable"),
      scaffoldMove: parsed.scaffoldMove,
      assignmentId,
      sourceMaterialIds: parsed.sourceMaterialIds,
      requiresCurrentSources: parsed.requiresCurrentSources ?? false,
      temporarilyUnavailable: Boolean(parsed.temporarilyUnavailable),
    }),
  };

  if (input.replaceMessageId) {
    await db
      .update(inquiryMessages)
      .set(persistedMessage)
      .where(and(eq(inquiryMessages.id, input.replaceMessageId), eq(inquiryMessages.threadId, input.threadId)));
  } else {
    await db.insert(inquiryMessages).values({
      id: fiosraMsgId,
      threadId: input.threadId,
      author: "fiosra",
      messageType: "scaffold",
      ...persistedMessage,
    });
  }

  return {
    id: fiosraMsgId,
    author: "fiosra" as const,
    messageType: "scaffold" as const,
    content: parsed.body,
    scaffoldMove: parsed.scaffoldMove,
    choices: parsed.suggestedChoices,
  };
}

export async function addInquiryNote(input: {
  threadId: string;
  studentProfileId?: string;
  noteType: "question" | "tension" | "reflection";
  content: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const studentProfileId = input.studentProfileId ?? CANONICAL_STUDENT_PROFILE_ID;
  const content = (input.content || "").trim();
  if (content.length < 3) {
    throw new Error("Note content cannot be empty.");
  }

  const noteId = `inq_note_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  await db.insert(inquiryNotes).values({
    id: noteId,
    threadId: input.threadId,
    studentProfileId,
    noteType: input.noteType,
    content,
  });

  return {
    id: noteId,
    threadId: input.threadId,
    noteType: input.noteType,
    content,
  };
}

export async function removeInquiryNote(noteId: string, studentProfileId = CANONICAL_STUDENT_PROFILE_ID) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  await db
    .delete(inquiryNotes)
    .where(and(eq(inquiryNotes.id, noteId), eq(inquiryNotes.studentProfileId, studentProfileId)));

  return { success: true };
}
