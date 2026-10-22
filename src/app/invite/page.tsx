import { InviteForm } from "./invite-form";

// Opened from an invite link (`?token=`); works without a session.
export default function InvitePage() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-12">
      <InviteForm />
    </main>
  );
}
