import api from "./api";

// GET mentees of logged-in mentor
export const getMentorMentees = async () => {
  return api.get("/api/mentor/mentees");
};

// Update mentee progress
export const updateProgress = async (menteeId, progress) => {
  return api.put(`/api/mentor/progress/${menteeId}`, { progress });
};
