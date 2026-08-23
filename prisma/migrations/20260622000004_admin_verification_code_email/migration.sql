-- Admin 2FA switches from SMS (phone) to email delivery. No verification
-- code has ever been successfully delivered via SMS (toll-free number was
-- never verified for A2P messaging), so there is no meaningful data to
-- preserve — any existing rows are abandoned/expired attempts.
ALTER TABLE "AdminVerificationCode" DROP COLUMN "phone";
ALTER TABLE "AdminVerificationCode" ADD COLUMN "email" TEXT NOT NULL DEFAULT '';
ALTER TABLE "AdminVerificationCode" ALTER COLUMN "email" DROP DEFAULT;
