// app/terms/page.tsx
import Link from "next/link";

export const metadata = {
  title: "Terms of Service — Petora",
  description:
    "The terms that govern your use of Petora, the Adopt Me pet portfolio tracker.",
};

const EFFECTIVE_DATE = "June 18, 2026";
const CONTACT_EMAIL = "support@petoratracker.com"; // TODO: set to a real inbox you monitor

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 text-slate-200">
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 backdrop-blur-sm sm:p-10">
        <h1 className="text-3xl font-bold tracking-tight text-white">
          Terms of Service
        </h1>
        <p className="mt-2 text-sm text-slate-400">
          Effective date: {EFFECTIVE_DATE}
        </p>

        <div className="mt-8 space-y-8 leading-relaxed text-slate-300">
          <section className="space-y-3">
            <p>
              These Terms of Service (&quot;Terms&quot;) govern your access to
              and use of Petora at{" "}
              <span className="text-white">https://petoratracker.com</span> (the
              &quot;Service&quot;). By creating an account or using the Service,
              you agree to these Terms. If you do not agree, do not use the
              Service.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-white">
              1. What Petora is
            </h2>
            <p>
              Petora is a portfolio tracker for the Roblox game Adopt Me. It lets
              you record the pets you own, optionally verify your Roblox account,
              and view an estimated total value of your collection, including on
              a public leaderboard.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-white">
              2. Not affiliated with Roblox or Adopt Me
            </h2>
            <p>
              Petora is an independent, fan-made project. It is not affiliated
              with, endorsed by, sponsored by, or in any way officially connected
              to Roblox Corporation, the developers of Adopt Me, or any of their
              affiliates. &quot;Roblox&quot; and &quot;Adopt Me&quot; are the
              property of their respective owners. Your use of Roblox and Adopt
              Me is governed by their own terms.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-white">
              3. Eligibility and accounts
            </h2>
            <ul className="list-disc space-y-2 pl-6 marker:text-indigo-400">
              <li>
                You are responsible for the activity that happens under your
                account and for keeping your login credentials secure.
              </li>
              <li>
                You agree to provide accurate information and to use Roblox&apos;s
                official OAuth flow honestly when verifying your account.
              </li>
              <li>
                You must use the Service only with accounts you own or are
                authorized to use.
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-white">
              4. Acceptable use
            </h2>
            <p>You agree not to:</p>
            <ul className="list-disc space-y-2 pl-6 marker:text-indigo-400">
              <li>
                Upload content that is unlawful, infringing, or that you do not
                have the right to upload.
              </li>
              <li>
                Attempt to falsify portfolios, manipulate the leaderboard, or
                impersonate another player.
              </li>
              <li>
                Disrupt, overload, reverse-engineer, scrape, or attempt to gain
                unauthorized access to the Service or its infrastructure.
              </li>
              <li>
                Use the Service to harass others or to violate Roblox&apos;s
                terms or community standards.
              </li>
            </ul>
            <p>
              We may suspend or terminate accounts that violate these Terms.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-white">
              5. Pet values are estimates
            </h2>
            <p>
              Estimated pet values displayed in Petora are sourced from{" "}
              <span className="text-white">Elvebredd</span>, a third-party
              community value list, and are provided &quot;as is&quot; for
              informational and entertainment purposes only. Values are community
              estimates, may be inaccurate or out of date, and do not represent
              real-world currency or any guarantee. You are solely responsible
              for any in-game trades or decisions you make, and Petora is not
              liable for them.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-white">
              6. Your content
            </h2>
            <p>
              You retain ownership of the screenshots and portfolio data you
              submit. By submitting content, you grant Petora a limited license
              to store and process it solely to operate the Service — for
              example, to recognize your pets, build your portfolio, and display
              verified portfolios on the public leaderboard as described in our{" "}
              <Link
                href="/privacy"
                className="text-indigo-400 underline-offset-4 hover:underline"
              >
                Privacy Policy
              </Link>
              .
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-white">
              7. Service availability
            </h2>
            <p>
              The Service is provided on an &quot;as is&quot; and &quot;as
              available&quot; basis. Petora is a hobby project and may experience
              downtime, bugs, or data loss. We may modify, suspend, or
              discontinue any part of the Service at any time without notice.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-white">
              8. Disclaimers and limitation of liability
            </h2>
            <p>
              To the maximum extent permitted by law, Petora and its operators
              disclaim all warranties, express or implied, including merchantability,
              fitness for a particular purpose, and non-infringement. To the
              maximum extent permitted by law, Petora and its operators will not
              be liable for any indirect, incidental, special, consequential, or
              punitive damages, or any loss of data, profits, or in-game items,
              arising from your use of the Service.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-white">9. Termination</h2>
            <p>
              You may stop using the Service and delete your account at any time.
              We may suspend or terminate your access if you violate these Terms
              or if we discontinue the Service. Upon termination, the relevant
              provisions of these Terms (such as disclaimers and limitation of
              liability) will survive.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-white">
              10. Changes to these Terms
            </h2>
            <p>
              We may update these Terms from time to time. When we do, we will
              update the effective date above. Your continued use of the Service
              after changes take effect constitutes acceptance of the revised
              Terms.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-white">11. Contact us</h2>
            <p>
              Questions about these Terms? Reach us at{" "}
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
            href="/privacy"
            className="text-indigo-400 underline-offset-4 hover:underline"
          >
            Privacy Policy
          </Link>
          .
        </div>
      </div>
    </main>
  );
}