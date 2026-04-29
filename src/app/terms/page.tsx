'use client';

import Link from 'next/link';
import { Package, ArrowLeft } from 'lucide-react';

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-[#0f172a]/[0.06]">
        <div className="max-w-[800px] mx-auto px-6 py-5 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-gradient-to-br from-[#3b82f6] to-[#06b6d4]">
              <Package className="h-4 w-4 text-white" />
            </div>
            <span className="text-[15px] font-semibold text-[#0f172a]/80">blujay</span>
          </Link>
          <Link href="/" className="inline-flex items-center gap-2 text-[13px] text-[#0f172a]/40 hover:text-[#0f172a]/70 transition-colors">
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Home
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-[800px] mx-auto px-6 py-16">
        <div className="mb-12">
          <h1 className="text-3xl sm:text-4xl font-bold text-[#0f172a] tracking-[-0.03em] mb-3">Terms & Conditions</h1>
          <p className="text-[14px] text-[#0f172a]/40">Last updated: April 29, 2026</p>
        </div>

        <div className="prose-custom space-y-10">
          <section>
            <h2>1. Acceptance of Terms</h2>
            <p>
              By accessing or using the Blujay Logistics platform (&ldquo;Platform&rdquo;), operated by Blujay Logistics Private Limited (&ldquo;Blujay,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;), you agree to be bound by these Terms & Conditions (&ldquo;Terms&rdquo;). If you do not agree to these Terms, you may not use the Platform.
            </p>
            <p>
              These Terms constitute a legally binding agreement between you (whether an individual or an entity) and Blujay Logistics. By registering for an account, accessing the Platform, or using any of our services, you acknowledge that you have read, understood, and agree to be bound by these Terms.
            </p>
          </section>

          <section>
            <h2>2. Description of Services</h2>
            <p>
              Blujay provides a courier aggregation platform that enables businesses to compare shipping rates, book shipments, generate waybills, track deliveries, and manage logistics operations across multiple courier partners. Our services include but are not limited to:
            </p>
            <ul>
              <li>Multi-carrier rate comparison across 15+ courier partners including Delhivery, BlueDart, DTDC, Ekart, Shadowfax, Xpressbees, and others</li>
              <li>Shipment booking, waybill generation, and label printing</li>
              <li>Real-time shipment tracking and delivery notifications</li>
              <li>Cash on Delivery (COD) services and remittance management</li>
              <li>Reverse logistics and return management</li>
              <li>Analytics dashboard and shipping performance reports</li>
              <li>Wallet-based billing and payment management</li>
              <li>API access for platform integrations</li>
            </ul>
            <p>
              Blujay acts as an intermediary between you and the courier partners. We do not directly handle, transport, or deliver shipments. The actual transportation and delivery services are provided by third-party courier companies.
            </p>
          </section>

          <section>
            <h2>3. Account Registration</h2>
            <p>
              To use the Platform, you must create an account by providing accurate and complete information including your name, email address, business details, and contact information. You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account.
            </p>
            <p>
              You must be at least 18 years of age and have the legal authority to enter into these Terms on behalf of yourself or the entity you represent. You agree to notify us immediately of any unauthorized use of your account.
            </p>
          </section>

          <section>
            <h2>4. Shipping & Booking</h2>
            <p>
              When you book a shipment through the Platform, you enter into a contract with the selected courier partner for the transportation of your goods. Blujay facilitates this booking but is not a party to the shipping contract between you and the courier partner.
            </p>
            <p>
              You are solely responsible for ensuring that:
            </p>
            <ul>
              <li>All shipment details (addresses, weights, dimensions, contents) are accurate and complete</li>
              <li>The goods being shipped comply with all applicable laws and do not include prohibited or restricted items</li>
              <li>Proper packaging is used to protect goods during transit</li>
              <li>All customs declarations and documentation for interstate or international shipments are accurate</li>
            </ul>
            <p>
              Shipping rates displayed on the Platform are estimates based on information provided by courier partners and may vary based on actual weight, dimensions, destination serviceability, and surcharges applied by the courier.
            </p>
          </section>

          <section>
            <h2>5. Wallet, Payments & Pricing</h2>
            <p>
              The Platform operates on a prepaid wallet system. You must maintain a sufficient wallet balance to book shipments. Wallet top-ups can be made via UPI, net banking, credit/debit cards, or other supported payment methods.
            </p>
            <p>
              Shipping charges are deducted from your wallet at the time of booking. If the actual weight or dimensions of a shipment differ from the booked values, the courier partner may apply weight discrepancy charges, which will be adjusted from your wallet balance.
            </p>
            <p>
              COD remittances from courier partners will be credited to your wallet after the applicable remittance cycle (typically 2&ndash;7 business days after delivery, depending on the courier partner). Blujay is not responsible for delays in COD remittance caused by courier partners.
            </p>

            <h3>5.1 Shopify App Subscription</h3>
            <p>
              The Blujay Logistics app distributed via the Shopify App Store is currently <strong>free</strong> to install and use. We may introduce paid tiers in future releases; in that event, we will provide at least 30 days&rsquo; advance notice via email and via the in-app dashboard before any new paid tier becomes mandatory. Existing free-tier users will not be retroactively charged for past usage.
            </p>
            <p>
              You may cancel at any time by uninstalling the Blujay Logistics app from your Shopify admin (Settings &rarr; Apps &rarr; Uninstall). Uninstallation immediately revokes our access to your store data and triggers Shopify&rsquo;s standard <code>app/uninstalled</code> and (after 48 hours) <code>shop/redact</code> webhooks, after which we anonymise the associated data per our Privacy Policy.
            </p>
          </section>

          <section>
            <h2>6. Liability & Disclaimers</h2>
            <p>
              Blujay acts solely as an aggregation platform and does not provide transportation or delivery services. We are not liable for:
            </p>
            <ul>
              <li>Loss, damage, or delay of shipments during transit</li>
              <li>Actions or omissions of courier partners</li>
              <li>Inaccurate delivery timelines or rate estimates provided by courier partners</li>
              <li>Service disruptions caused by courier partners, natural disasters, strikes, or force majeure events</li>
            </ul>
            <p>
              Claims for lost or damaged shipments must be filed directly with the courier partner through our Platform within the time frame specified by the respective courier&rsquo;s terms of service (typically 7&ndash;14 days from the shipment date).
            </p>
            <p>
              To the maximum extent permitted by law, Blujay&rsquo;s total liability for any claim arising from or related to the Platform shall not exceed the fees paid by you to Blujay in the 12 months preceding the claim.
            </p>
          </section>

          <section>
            <h2>7. Prohibited Activities</h2>
            <p>You agree not to:</p>
            <ul>
              <li>Ship prohibited, hazardous, or illegal items through the Platform</li>
              <li>Provide false or misleading shipment information</li>
              <li>Use the Platform for any fraudulent or unlawful purpose</li>
              <li>Attempt to reverse-engineer, decompile, or disassemble the Platform</li>
              <li>Interfere with or disrupt the Platform&rsquo;s infrastructure or security</li>
              <li>Resell or redistribute Platform access without written authorization</li>
              <li>Abuse the wallet, COD, or refund systems</li>
            </ul>
            <p>
              Violation of these restrictions may result in immediate account suspension or termination, forfeiture of wallet balance, and legal action.
            </p>
          </section>

          <section>
            <h2>8. Indemnification</h2>
            <p>
              You agree to indemnify, defend, and hold harmless Blujay, its officers, directors, employees, agents, and sub-processors from and against any and all claims, damages, losses, liabilities, costs, and expenses (including reasonable attorneys&rsquo; fees) arising from or related to:
            </p>
            <ul>
              <li>Your shipment of prohibited, restricted, hazardous, or counterfeit goods</li>
              <li>False or misleading declarations made on shipment manifests, customs documents, or AWBs</li>
              <li>Intellectual property infringement claims arising from the goods you ship or content you upload</li>
              <li>Customs, taxation, or regulatory violations attributable to your shipments</li>
              <li>Claims by recipients or end-customers relating to data you provided to us in connection with a shipment</li>
              <li>Your breach of these Terms or violation of applicable law</li>
            </ul>
            <p>
              We will promptly notify you of any such claim and reasonably cooperate in your defense at your expense. You may not settle any claim that imposes obligations on Blujay without our prior written consent.
            </p>
          </section>

          <section>
            <h2>9. Intellectual Property</h2>
            <p>
              All content, features, and functionality of the Platform &mdash; including its design, code, logos, trademarks, text, graphics, and data &mdash; are owned by Blujay Logistics and are protected by copyright, trademark, and other intellectual property laws.
            </p>
            <p>
              You are granted a limited, non-exclusive, non-transferable license to access and use the Platform for your internal business purposes. This license does not include the right to modify, reproduce, distribute, or create derivative works from any part of the Platform.
            </p>
          </section>

          <section>
            <h2>10. Service Level &amp; Availability</h2>
            <p>
              We target <strong>99.5% monthly uptime</strong> for the Platform&rsquo;s core booking, label-generation, and tracking-sync functions, measured on a calendar-month basis and excluding:
            </p>
            <ul>
              <li>Scheduled maintenance announced at least 48 hours in advance</li>
              <li>Outages of upstream courier APIs (Blue Dart, DTDC, Delhivery, etc.) &mdash; these are outside our control and we do not warrant carrier uptime</li>
              <li>Outages of Shopify, payment gateways, or other third-party platforms we depend on</li>
              <li>Force majeure events including but not limited to natural disasters, government action, internet backbone outages, and large-scale cyber-attacks</li>
            </ul>
            <p>
              Severity-1 incidents (Platform fully unreachable for paying merchants) are responded to within 4 working hours during India business hours (09:30&ndash;19:00 IST, Mon&ndash;Sat). Status updates are published via email to affected merchants. We provide no monetary SLA credits at the free tier; future paid tiers may include credit terms which will be disclosed at the time those plans launch.
            </p>
          </section>

          <section>
            <h2>11. Termination</h2>
            <p>
              Either party may terminate this agreement at any time. You may close your account by contacting our support team. Blujay may suspend or terminate your account if you violate these Terms, engage in fraudulent activity, or for any other reason at our sole discretion.
            </p>
            <p>
              Upon termination, any remaining wallet balance (excluding pending disputes or chargebacks) will be refunded to your registered bank account within 15 business days.
            </p>
          </section>

          <section>
            <h2>12. Governing Law & Dispute Resolution</h2>
            <p>
              These Terms are governed by and construed in accordance with the laws of India. Any disputes arising from or relating to these Terms shall be subject to the exclusive jurisdiction of the courts in Hyderabad, Telangana, India.
            </p>
            <p>
              Before initiating any legal proceedings, the parties agree to attempt to resolve disputes through good-faith negotiation and, if necessary, mediation administered by a mutually agreed mediator.
            </p>
          </section>

          <section>
            <h2>13. Changes to These Terms</h2>
            <p>
              We may update these Terms from time to time. When we make changes, we will update the &ldquo;Last updated&rdquo; date at the top of this page and notify registered users via email. Continued use of the Platform after changes constitute acceptance of the revised Terms.
            </p>
          </section>

          <section>
            <h2>14. Contact Us</h2>
            <p>
              If you have questions about these Terms, please contact us at:
            </p>
            <p>
              <strong>Blujay Logistics Private Limited</strong><br />
              6th Floor, Oh Park, Madhapur<br />
              Hyderabad, Telangana, India 500081<br />
              Email: <a href="mailto:blujaylsolution@gmail.com">blujaylsolution@gmail.com</a><br />
              Phone: +91 80 4567 8900
            </p>
          </section>
        </div>
      </main>

      {/* Styles for the prose */}
      <style jsx>{`
        .prose-custom h2 {
          font-size: 1.25rem;
          font-weight: 700;
          color: #0f172a;
          margin-bottom: 0.75rem;
          letter-spacing: -0.01em;
        }
        .prose-custom h3 {
          font-size: 1rem;
          font-weight: 600;
          color: rgba(15, 23, 42, 0.8);
          margin-bottom: 0.5rem;
          margin-top: 1rem;
        }
        .prose-custom p {
          font-size: 0.875rem;
          line-height: 1.8;
          color: rgba(15, 23, 42, 0.55);
          margin-bottom: 0.75rem;
        }
        .prose-custom ul {
          list-style: disc;
          padding-left: 1.5rem;
          margin-bottom: 0.75rem;
        }
        .prose-custom li {
          font-size: 0.875rem;
          line-height: 1.8;
          color: rgba(15, 23, 42, 0.55);
          margin-bottom: 0.25rem;
        }
        .prose-custom a {
          color: #3b82f6;
        }
        .prose-custom a:hover {
          text-decoration: underline;
        }
        .prose-custom strong {
          color: rgba(15, 23, 42, 0.75);
        }
        .prose-custom code {
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 0.8125rem;
          background: rgba(15, 23, 42, 0.05);
          color: rgba(15, 23, 42, 0.75);
          padding: 0.125rem 0.375rem;
          border-radius: 0.25rem;
        }
      `}</style>
    </div>
  );
}
