import { useEffect, useState } from "react";

export const CANONICAL_STUDENT_PROFILE_ID = "profile_student_primary";
export const STUDENT_CONTEXT_CHANGE_EVENT = "fiosra:student-context-change";
export type StudentContextChangeEvent = CustomEvent<{ studentProfileId: string }>;

export function getStudentProfileId(location?: string) {
  if (typeof window === "undefined" && !location) return CANONICAL_STUDENT_PROFILE_ID;
  const locationSearch = location?.includes("?")
    ? new URL(location, typeof window !== "undefined" ? window.location.origin : "http://localhost").search
    : "";
  const search = locationSearch || (typeof window !== "undefined" ? window.location.search : "");
  return new URLSearchParams(search).get("student") || CANONICAL_STUDENT_PROFILE_ID;
}

export function withStudentContext(path: string, studentProfileId = getStudentProfileId()) {
  const [pathname, query = ""] = path.split("?");
  const params = new URLSearchParams(query);
  if (studentProfileId && studentProfileId !== CANONICAL_STUDENT_PROFILE_ID) {
    params.set("student", studentProfileId);
  } else {
    params.delete("student");
  }
  const nextQuery = params.toString();
  return nextQuery ? `${pathname}?${nextQuery}` : pathname;
}

export function getCurrentStudentProfileId() {
  return getStudentProfileId();
}

export function useStudentProfileId() {
  const [studentProfileId, setStudentProfileId] = useState(() => getStudentProfileId());

  useEffect(() => {
    const syncStudentContext = (event?: Event) => {
      const selectedFromEvent = (event as StudentContextChangeEvent | undefined)?.detail?.studentProfileId;
      setStudentProfileId(selectedFromEvent || getStudentProfileId());
    };
    window.addEventListener(STUDENT_CONTEXT_CHANGE_EVENT, syncStudentContext);
    window.addEventListener("popstate", syncStudentContext);
    return () => {
      window.removeEventListener(STUDENT_CONTEXT_CHANGE_EVENT, syncStudentContext);
      window.removeEventListener("popstate", syncStudentContext);
    };
  }, []);

  return studentProfileId;
}
