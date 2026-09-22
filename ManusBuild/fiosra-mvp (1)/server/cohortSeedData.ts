import { and, eq } from "drizzle-orm";
import {
  CANONICAL_COURSE_ID,
  CANONICAL_EDUCATOR_PROFILE_ID,
  CANONICAL_STUDENT_PROFILE_ID,
  CANONICAL_WORKSPACE_ID,
} from "./assignmentConstants";
import {
  fiosraProfiles,
  lmsRosterMemberships,
  workspaceMemberships,
} from "../drizzle/schema";
import { getDb } from "./db";

export interface CohortStudentDefinition {
  profileId: string;
  institutionalPersonRef: string;
  displayName: string;
  email: string;
  studentNumber: string;
  degreeProgramme: string;
}

/**
 * The approved 15-student cohort for SDM401 (Strategic Decision-Making in Organisations).
 * Moras Kashyap is the canonical student display identity from Stage 1.
 */
export const COHORT_STUDENTS: CohortStudentDefinition[] = [
  {
    profileId: CANONICAL_STUDENT_PROFILE_ID,
    institutionalPersonRef: "inst_student_kashyap_m",
    displayName: "Moras Kashyap",
    email: "moras.kashyap@fiosra.ac.demo",
    studentNumber: "22349012",
    degreeProgramme: "MSc Management & Strategic Innovation",
  },
  {
    profileId: "profile_student_aoife_byrne",
    institutionalPersonRef: "inst_student_byrne_a",
    displayName: "Aoife Byrne",
    email: "aoife.byrne@fiosra.ac.demo",
    studentNumber: "22349015",
    degreeProgramme: "MSc Management & Strategic Innovation",
  },
  {
    profileId: "profile_student_daniel_okafor",
    institutionalPersonRef: "inst_student_okafor_d",
    displayName: "Daniel Okafor",
    email: "daniel.okafor@fiosra.ac.demo",
    studentNumber: "22349018",
    degreeProgramme: "MSc Management & Strategic Innovation",
  },
  {
    profileId: "profile_student_leah_chen",
    institutionalPersonRef: "inst_student_chen_l",
    displayName: "Leah Chen",
    email: "leah.chen@fiosra.ac.demo",
    studentNumber: "22349022",
    degreeProgramme: "MSc Management & Strategic Innovation",
  },
  {
    profileId: "profile_student_marcus_orourke",
    institutionalPersonRef: "inst_student_orourke_m",
    displayName: "Marcus O'Rourke",
    email: "marcus.orourke@fiosra.ac.demo",
    studentNumber: "22349025",
    degreeProgramme: "MSc Business Analytics & Strategy",
  },
  {
    profileId: "profile_student_niamh_oshea",
    institutionalPersonRef: "inst_student_oshea_n",
    displayName: "Niamh O'Shea",
    email: "niamh.oshea@fiosra.ac.demo",
    studentNumber: "22349029",
    degreeProgramme: "MSc Management & Strategic Innovation",
  },
  {
    profileId: "profile_student_priya_shah",
    institutionalPersonRef: "inst_student_shah_p",
    displayName: "Priya Shah",
    email: "priya.shah@fiosra.ac.demo",
    studentNumber: "22349033",
    degreeProgramme: "MSc Business Analytics & Strategy",
  },
  {
    profileId: "profile_student_thomas_keane",
    institutionalPersonRef: "inst_student_keane_t",
    displayName: "Thomas Keane",
    email: "thomas.keane@fiosra.ac.demo",
    studentNumber: "22349037",
    degreeProgramme: "MSc Management & Strategic Innovation",
  },
  {
    profileId: "profile_student_helena_costa",
    institutionalPersonRef: "inst_student_costa_h",
    displayName: "Helena Costa",
    email: "helena.costa@fiosra.ac.demo",
    studentNumber: "22349041",
    degreeProgramme: "MSc International Business & Strategy",
  },
  {
    profileId: "profile_student_farah_elmasri",
    institutionalPersonRef: "inst_student_elmasri_f",
    displayName: "Farah El-Masri",
    email: "farah.elmasri@fiosra.ac.demo",
    studentNumber: "22349045",
    degreeProgramme: "MSc International Business & Strategy",
  },
  {
    profileId: "profile_student_ryan_donnelly",
    institutionalPersonRef: "inst_student_donnelly_r",
    displayName: "Ryan Donnelly",
    email: "ryan.donnelly@fiosra.ac.demo",
    studentNumber: "22349049",
    degreeProgramme: "MSc Management & Strategic Innovation",
  },
  {
    profileId: "profile_student_sophie_martin",
    institutionalPersonRef: "inst_student_martin_s",
    displayName: "Sophie Martin",
    email: "sophie.martin@fiosra.ac.demo",
    studentNumber: "22349053",
    degreeProgramme: "MSc Management & Strategic Innovation",
  },
  {
    profileId: "profile_student_jack_foley",
    institutionalPersonRef: "inst_student_foley_j",
    displayName: "Jack Foley",
    email: "jack.foley@fiosra.ac.demo",
    studentNumber: "22349057",
    degreeProgramme: "MSc Business Analytics & Strategy",
  },
  {
    profileId: "profile_student_grace_oconnell",
    institutionalPersonRef: "inst_student_oconnell_g",
    displayName: "Grace O'Connell",
    email: "grace.oconnell@fiosra.ac.demo",
    studentNumber: "22349061",
    degreeProgramme: "MSc Management & Strategic Innovation",
  },
  {
    profileId: "profile_student_eoin_gallagher",
    institutionalPersonRef: "inst_student_gallagher_e",
    displayName: "Eoin Gallagher",
    email: "eoin.gallagher@fiosra.ac.demo",
    studentNumber: "22349065",
    degreeProgramme: "MSc Management & Strategic Innovation",
  },
];

/**
 * Seeds the approved 15 institutional cohort students and memberships idempotently.
 * Preserves the canonical Moras Kashyap and Dr. Isobel Cunningham display identities.
 */
export async function seedInstitutionalCohort() {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  // 1. Ensure lead educator profile exists
  await db
    .insert(fiosraProfiles)
    .values({
      id: CANONICAL_EDUCATOR_PROFILE_ID,
      displayName: "Dr. Isobel Cunningham",
      role: "educator",
      title: "Lead Course Designer & Module Coordinator",
      email: "isobel.cunningham@fiosra.ac.demo",
    })
    .onDuplicateKeyUpdate({
      set: {
        displayName: "Dr. Isobel Cunningham",
        role: "educator",
        title: "Lead Course Designer & Module Coordinator",
        email: "isobel.cunningham@fiosra.ac.demo",
      },
    });

  // 2. Ensure lead educator workspace membership
  await db
    .insert(workspaceMemberships)
    .values({
      id: "membership_educator_lead",
      workspaceId: CANONICAL_WORKSPACE_ID,
      profileId: CANONICAL_EDUCATOR_PROFILE_ID,
      membershipRole: "educator",
    })
    .onDuplicateKeyUpdate({
      set: {
        membershipRole: "educator",
      },
    });

  // 3. Ensure lead educator LMS roster membership
  await db
    .insert(lmsRosterMemberships)
    .values({
      id: "lms_roster_educator_lead",
      courseId: CANONICAL_COURSE_ID,
      fiosraProfileId: CANONICAL_EDUCATOR_PROFILE_ID,
      institutionalPersonRef: "inst_staff_cunningham_i",
      rosterRole: "educator",
      rosterState: "active",
      sourceSystem: "lms_simulator",
      sourceRecordRef: "roster_staff_cunningham",
      sourceVersion: "v1",
    })
    .onDuplicateKeyUpdate({
      set: {
        rosterRole: "educator",
        rosterState: "active",
      },
    });

  // 4. Seed all 15 cohort students
  for (const student of COHORT_STUDENTS) {
    // 4a. Fiosra Profile
    await db
      .insert(fiosraProfiles)
      .values({
        id: student.profileId,
        displayName: student.displayName,
        role: "student",
        title: student.degreeProgramme,
        email: student.email,
      })
      .onDuplicateKeyUpdate({
        set: {
          displayName: student.displayName,
          role: "student",
          title: student.degreeProgramme,
          email: student.email,
        },
      });

    // 4b. Fiosra Workspace Membership
    const membershipId =
      student.profileId === CANONICAL_STUDENT_PROFILE_ID
        ? "membership_student_primary"
        : `membership_ws_${CANONICAL_WORKSPACE_ID}_${student.profileId}`;
    await db
      .insert(workspaceMemberships)
      .values({
        id: membershipId,
        workspaceId: CANONICAL_WORKSPACE_ID,
        profileId: student.profileId,
        membershipRole: "student",
      })
      .onDuplicateKeyUpdate({
        set: {
          membershipRole: "student",
        },
      });

    // 4c. LMS Roster Membership
    const rosterId = `lms_roster_${CANONICAL_COURSE_ID}_${student.profileId}`;
    await db
      .insert(lmsRosterMemberships)
      .values({
        id: rosterId,
        courseId: CANONICAL_COURSE_ID,
        fiosraProfileId: student.profileId,
        institutionalPersonRef: student.institutionalPersonRef,
        rosterRole: "student",
        rosterState: "active",
        sourceSystem: "lms_simulator",
        sourceRecordRef: `roster_rec_${student.studentNumber}`,
        sourceVersion: "v1",
      })
      .onDuplicateKeyUpdate({
        set: {
          institutionalPersonRef: student.institutionalPersonRef,
          rosterRole: "student",
          rosterState: "active",
        },
      });
  }
}
