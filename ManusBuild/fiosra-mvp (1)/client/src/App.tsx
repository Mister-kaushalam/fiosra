import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import HomePage from "./pages/Home";
import StudentNowPage from "./pages/StudentNow";
import AssignmentContextPage from "./pages/AssignmentContext";
import LearningWorkspacePage from "./pages/LearningWorkspace";
import DevelopmentTracePage from "./pages/DevelopmentTrace";
import DevelopmentTraceDocumentPage from "./pages/DevelopmentTraceDocument";
import AssembledAssignmentPage from "./pages/AssembledAssignment";
import InquiryStudioPage from "./pages/InquiryStudio";
import EducatorWorkspacePage from "./pages/EducatorWorkspace";
import EducatorCourseOverviewPage from "./pages/EducatorCourseOverview";
import EducatorPatternPage from "./pages/EducatorPattern";
import AssignmentCohortContextPage from "./pages/AssignmentCohortContext";
import StudentContextPage from "./pages/StudentContext";
import EducatorEvidenceInspectionPage from "./pages/EducatorEvidenceInspection";
import EducatorAcademicReviewPage from "./pages/EducatorAcademicReview";
import EducatorStudentCourseHistoryPage from "./pages/EducatorStudentCourseHistory";
import EducatorAssignmentAuthoringPage from "./pages/EducatorAssignmentAuthoring";
import LmsCourseHomePage from "./pages/LmsCourseHome";
import LmsAssignmentDetailPage from "./pages/LmsAssignmentDetail";
import LmsEducatorAssignmentContextPage from "./pages/LmsEducatorAssignmentContext";
import LmsLaunchPage from "./pages/LmsLaunch";

function Router() {
  return (
    <Switch>
      {/* LMS Simulator Routes */}
      <Route path="/lms/courses/sdm401" component={LmsCourseHomePage} />
      <Route path="/lms/courses/sdm401/assignments/:assignmentIdentifier" component={LmsAssignmentDetailPage} />
      <Route path="/lms/courses/sdm401/assignments/atlantic-edge-foods" component={LmsAssignmentDetailPage} />
      <Route path="/lms/courses/sdm401/assignments/:assignmentIdentifier/educator" component={LmsEducatorAssignmentContextPage} />
      <Route path="/lms/courses/sdm401/assignments/atlantic-edge-foods/educator" component={LmsEducatorAssignmentContextPage} />
      <Route path="/lms/launch/:launchId" component={LmsLaunchPage} />

      {/* Public product entry */}
      <Route path="/" component={HomePage} />
      <Route path="/student/now" component={StudentNowPage} />
      {/* Inquiry Studio Routes */}
      <Route path="/student/inquiry" component={InquiryStudioPage} />
      <Route path="/student/inquiry/:threadId" component={InquiryStudioPage} />
      {/* Parameterized routes */}
      <Route path="/student/assignment/:assignmentSlug" component={AssignmentContextPage} />
      <Route path="/student/workspace/:assignmentSlug" component={LearningWorkspacePage} />
      <Route path="/student/development/:assignmentSlug" component={DevelopmentTracePage} />
      <Route path="/student/development/:assignmentSlug/trace" component={DevelopmentTraceDocumentPage} />
      <Route path="/student/assignment/:assignmentSlug/review" component={AssembledAssignmentPage} />
      {/* Locked Canonical Compatibility Routes */}
      <Route path="/student/assignment/atlantic-edge-foods" component={AssignmentContextPage} />
      <Route path="/student/workspace/atlantic-edge-foods" component={LearningWorkspacePage} />
      <Route path="/student/development/atlantic-edge-foods" component={DevelopmentTracePage} />
      <Route path="/student/development/atlantic-edge-foods/trace" component={DevelopmentTraceDocumentPage} />
      <Route path="/student/assignment/atlantic-edge-foods/review" component={AssembledAssignmentPage} />

      {/* Educator Workstream A Routes */}
      <Route path="/educator/workspace" component={EducatorWorkspacePage} />
      <Route path="/educator/workspace/:workspaceId" component={EducatorWorkspacePage} />
      <Route path="/educator/courses/sdm401" component={EducatorCourseOverviewPage} />
      <Route path="/educator/assignments/new" component={EducatorAssignmentAuthoringPage} />
      <Route path="/educator/workspace/:workspaceId/assignments/new" component={EducatorAssignmentAuthoringPage} />
      <Route path="/educator/workspace/:workspaceId/assignments/:assignmentId/edit" component={EducatorAssignmentAuthoringPage} />
      <Route path="/educator/courses/:courseCode/patterns/:lensId" component={EducatorPatternPage} />
      <Route path="/educator/workspace/:workspaceId/assignments/:assignmentId" component={AssignmentCohortContextPage} />
      <Route path="/educator/workspace/:workspaceId/students/:studentProfileId/history" component={EducatorStudentCourseHistoryPage} />
      <Route path="/educator/workspace/:workspaceId/assignments/:assignmentId/students/:studentProfileId" component={StudentContextPage} />
      <Route path="/educator/workspace/:workspaceId/moments/:momentId/evidence" component={EducatorEvidenceInspectionPage} />
      <Route path="/educator/workspace/:workspaceId/assignments/:assignmentId/students/:studentProfileId/review" component={EducatorAcademicReviewPage} />

      <Route path="/404" component={NotFound} />
      {/* Final fallback route */}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
