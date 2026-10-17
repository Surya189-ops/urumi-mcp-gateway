export type UserRole = "admin" | "member";

export interface UserRecord {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserRepository {
  create(input: {
    id: string;
    email: string;
    displayName: string;
    role?: UserRole;
  }): Promise<UserRecord>;

  findById(id: string): Promise<UserRecord | undefined>;

  list(): Promise<UserRecord[]>;

  updateRole(id: string, role: UserRole): Promise<UserRecord | undefined>;
}
