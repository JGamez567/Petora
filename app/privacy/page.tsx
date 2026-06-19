// app/privacy/page.tsx
import Link from "next/link";

export const metadata = {
  title: "Privacy Policy — Petora",
  description:
    "How Petora collects, uses, and protects your data when you track your Adopt Me pet portfolio.",
};

const EFFECTIVE_DATE = "June 18, 2026";
const CONTACT_EMAIL = "support@petoratracker.com"; // TODO: set to a real inbox you monitor

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 text-slate-200">
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 backdrop-blur-sm sm:p-10">
        <h1 className="text-3xl font-bold tracking-tight text-white">
          Privacy Policy
        </h1>
        <p className="mt-2 text-sm text-slate-400">
          Effective date: {EFFECTIVE_DATE}
        </p>

        <div className="mt-8 space-y-8 leading-relaxed text-slate-300">
          <section className="space-y-3">
            <p>
              Petora (&quot;Petora,&quot; &quot;we,&quot; &quot;us,&quot; or
              &quot;our&quot;) is a portfolio tracker for the Roblox game Adopt
              Me. This Privacy Policy explains what information we collect when
              you use{" "}
              <span className="text-white">https://petoratracker.com</span> (the
              &quot;Service&quot;), how we use it, and the choices you have.
            </p>
            <p>
              Petora is an independent fan-made project. It is not affiliated
              with, endorsed by, or sponsored by Roblox Corporation or the
              developers of Adopt Me.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-white">
              1. Information we collect
            </h2>
            <p>We collect only what we need to run the Service:</p>
            <ul className="list-disc space-y-2 pl-6 marker:text-indigo-400">
              <li>
                <span className="font-medium text-white">
                  Account &amp; login information.
                </span>{" "}
                When you create an account we collect your email address through
                our authentication provider (Supabase) so you can sign in and
                recover your account.
              </li>
              <li>
                <span className="font-medium text-white">
                  Roblox identity (via OAuth).
                </span>{" "}
                If you choose to verify your Roblox account, we use Roblox&apos;s
                official OAuth 2.0 sign-in. From this we receive your{" "}
                <span className="text-white">Roblox user ID</span> and{" "}
                <span className="text-white">Roblox username</span>. We never see
                or store your Roblox password.
              </li>
              <li>
                <span className="font-medium text-white">
                  Pet portfolio data.
                </span>{" "}
                The Adopt Me pets you add to your portfolio, their variants, and
                the resulting total estimated value.
              </li>
              <li>
                <span className="font-medium text-white">
                  Screenshots you upload.
                </span>{" "}
                When you use the scanner, you upload screenshots of your in-game
                inventory board. These images are processed to recognize your
                pets (see Section 3).
              </li>
              <li>
                <span className="font-medium text-white">
                  Basic technical data.
                </span>{" "}
                Standard information our hosting providers log to keep the
                Service secure and reliable, such as IP address and request
                metadata.
              </li>
            </ul>
            <p>
              We do{" "}
              <span className="font-medium text-white">not</span> knowingly
              collect any payment card numbers, government IDs, or sensitive
              personal information beyond what is listed above.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-white">
              2. How we use your information
            </h2>
            <ul className="list-disc space-y-2 pl-6 marker:text-indigo-400">
              <li>To create and maintain your account and let you sign in.</li>
              <li>
                To verify that a portfolio belongs to a real Roblox account
                using your Roblox user ID and username.
              </li>
              <li>
                To build, display, and update your pet portfolio and its
                estimated value.
              </li>
              <li>
                To show verified usernames and portfolio values on the public
                leaderboard (see Section 5).
              </li>
              <li>To operate, secure, debug, and improve the Service.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-white">
              3. Screenshot scanning
            </h2>
            <p>
              When you upload inventory screenshots, they are sent to our image
              recognition service to identify which pets you own. We use the
              recognition results to populate your portfolio. Uploaded
              screenshots are not published with your account except where you
              choose to appear on the public leaderboard; leaderboard images are
              kept compressed, limited to the latest submission per user, and are
              automatically deleted after a retention period.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-white">
              4. Pet values and third-party data
            </h2>
            <p>
              Estimated pet values shown in Petora are sourced from{" "}
              <span className="text-white">Elvebredd</span>, a third-party
              community value list. These values are community estimates, may be
              inaccurate or outdated, and are provided for informational and
              entertainment purposes only. Petora does not guarantee any value
              and is not responsible for trades or decisions made based on it.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-white">
              5. Public leaderboard
            </h2>
            <p>
              If you verify your Roblox account, your Roblox username and total
              portfolio value may be displayed publicly on the Petora
              leaderboard so other players can see top collections. Your email
              address is never shown publicly. If you do not want to appear on
              the leaderboard, do not verify your account, or contact us to be
              removed.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-white">
              6. How your data is stored
            </h2>
            <p>
              Your account and portfolio data are stored in{" "}
              <span className="text-white">Supabase</span> (Postgres), our
              database and authentication provider. Access to your private data
              is restricted using row-level security so that you can only read
              and write your own records. We rely on reputable hosting providers
              (including Supabase, Vercel, and Render) and take reasonable
              technical measures to protect your information, but no method of
              transmission or storage is completely secure.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-white">
              7. Sharing your information
            </h2>
            <p>
              We do not sell your personal information. We share data only with
              the service providers that power Petora (such as Supabase, Vercel,
              Render, and Roblox&apos;s OAuth service) so they can perform their
              functions, or where required by law.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-white">
              8. Data retention and your choices
            </h2>
            <p>
              We retain your account and portfolio data for as long as your
              account is active. You may request access to, correction of, or
              deletion of your data at any time by contacting us. Deleting your
              account removes your portfolio and associated personal data,
              subject to limited backups and legal obligations.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-white">
              9. Children&apos;s privacy
            </h2>
            <p>
              Petora is intended for a general audience. If you are under the age
              of digital consent in your country, please use Petora only with
              the involvement of a parent or guardian. If you believe a child has
              provided us personal information without appropriate consent,
              contact us and we will delete it.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-white">
              10. Changes to this policy
            </h2>
            <p>
              We may update this Privacy Policy from time to time. When we do, we
              will update the effective date above. Significant changes will be
              communicated through the Service.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-white">11. Contact us</h2>
            <p>
              If you have questions about this Privacy Policy or your data, reach
              us at{" "}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="text-indigo-400 underline-offset-4 hover:underline"
              >
                {CONTACT_EMAIL}
              </a>
              .
            </p>
          </section>
        </div>

        <div className="mt-10 border-t border-white/10 pt-6 text-sm text-slate-400">
          See also our{" "}
          <Link
            href="/terms"
            className="text-indigo-400 underline-offset-4 hover:underline"
          >
            Terms of Service
          </Link>
          .
        </div>
      </div>
    </main>
  );
}