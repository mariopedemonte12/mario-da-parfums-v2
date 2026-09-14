export type Role = "user" | "admin";

// Mirrors backend UserResponseDto (backend/src/users/dto/response-user.dto.ts).
// Never add a token/credential field here — this type is also what gets
// cached in localStorage (see useAuth), and no credential may live there.
export type User = {
  id: number;
  name: string;
  email: string;
  role: Role;
  photoS3Key: string | null;
  createdAt: string;
};
