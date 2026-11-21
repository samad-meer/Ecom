import { RequireAuth } from "@/features/auth/components/RequireAuth";
import { StaffGuard } from "@/features/auth/components/StaffGuard";
import { ProfileView } from "@/features/profile/components/ProfileView";

export default function AdminProfilePage() {
  return (
    <RequireAuth>
      <StaffGuard>
        <div className="p-6">
          <ProfileView />
        </div>
      </StaffGuard>
    </RequireAuth>
  );
}
