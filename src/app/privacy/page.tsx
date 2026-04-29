'use client';

import Link from 'next/link';
import { Package, ArrowLeft } from 'lucide-react';

export default function PrivacyPage() {
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
          <h1 className="text-3xl sm:text-4xl font-bold text-[#0f172a] tracking-[-0.03em] mb-3">Privacy Policy</h1>
          <p className="text-[14px] text-[#0f172a]/40">Last updated: April 29, 2026</p>
        </div>

        <div className="prose-custom space-y-10">
          <section>
            <h2>1. Introduction & Data Controller</h2>
            <p>
              Blujay Logistics Private Limited (&ldquo;Blujay,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;) is committed to protecting the privacy and security of your personal information. This Privacy Policy explains how we collect, use, store, share, and protect your data when you use our courier aggregation platform (&ldquo;Platform&rdquo;) and related services.
            </p>
            <p>
              <strong>Data Controller (registered entity):</strong><br />
              Blujay Logistics Private Limited<br />
              6th Floor, Oh Park, Madhapur<br />
              Hyderabad, Telangana, India 500081<br />
              CIN: [COMPANY CIN]<br />
              Email: <a href="mailto:blujaylsolution@gmail.com">blujaylsolution@gmail.com</a>
            </p>
            <p>
              This policy complies with the Information Technology Act, 2000, the IT (Reasonable Security Practices and Procedures and Sensitive Personal Data or Information) Rules, 2011, the Digital Personal Data Protection Act, 2023 (DPDP Act), and applies the GDPR and CCPA frameworks for users in those jurisdictions.
            </p>
          </section>

          <section>
            <h2>2. Information We Collect</h2>
            <p>We collect the following types of information:</p>

            <h3>2.1 Information You Provide (merchants)</h3>
            <ul>
              <li><strong>Account information:</strong> Name, email address, phone number, company name, GSTIN, and password when you register</li>
              <li><strong>Shipping information:</strong> Sender and recipient names, addresses, phone numbers, pin codes, and shipment details (weight, dimensions, contents description)</li>
              <li><strong>Payment information:</strong> Bank account details, UPI IDs, and transaction records for wallet top-ups and COD remittances (we do not store credit/debit card numbers &mdash; these are handled by our PCI-DSS compliant payment processor)</li>
              <li><strong>Business information:</strong> Company registration details, pickup addresses, default shipping preferences</li>
              <li><strong>Communication data:</strong> Support tickets, emails, chat messages, and feedback submitted through the Platform</li>
            </ul>

            <h3>2.2 End-Customer (Recipient) Data</h3>
            <p>
              When you create a shipment, the recipient&rsquo;s name, phone, and address travel through our Platform to the carrier. With respect to this data we act as a <strong>data processor</strong>; the merchant is the data controller. We process recipient PII solely to fulfill the shipment the merchant has booked, retaining it only for the period mandated by Indian tax/commerce law (see Section 7).
            </p>

            <h3>2.3 Information Collected Automatically</h3>
            <ul>
              <li><strong>Usage data:</strong> Pages visited, features used, search queries, shipment history, and interaction patterns on the Platform</li>
              <li><strong>Device information:</strong> Browser type, operating system, device identifiers, screen resolution, and language preferences</li>
              <li><strong>Log data:</strong> IP addresses, access timestamps, referring URLs, and error logs</li>
              <li><strong>Cookies:</strong> Session cookies, authentication tokens, and analytics cookies (see Section 8)</li>
            </ul>

            <h3>2.4 Information from Shopify (when integrated)</h3>
            <ul>
              <li><strong>Shop information:</strong> Shop domain, shop ID, owner email</li>
              <li><strong>Order data:</strong> Order number, line items, quantities, prices, and recipient shipping address (via <code>read_orders</code> scope)</li>
              <li><strong>Fulfillment data:</strong> We write fulfillment records back when shipments are booked (via <code>write_fulfillments</code> and <code>*_merchant_managed_fulfillment_orders</code> scopes)</li>
            </ul>

            <h3>2.5 Information from Courier Partners</h3>
            <ul>
              <li>AWB number, scan events, proof of delivery, weight discrepancy data, and COD collection details from Blue Dart, DTDC, Delhivery, and other carrier APIs you enable</li>
            </ul>
          </section>

          <section>
            <h2>3. How &amp; Why We Use Your Information (Purpose Limitation)</h2>
            <p>In line with GDPR Article 5(1)(b) (purpose limitation), we use information only for these documented purposes:</p>
            <ul>
              <li>Create and manage your account, authenticate your identity, and provide customer support</li>
              <li>Process shipment bookings, generate waybills, and facilitate deliveries through courier partners</li>
              <li>Calculate and display shipping rates, apply discounts, and manage wallet transactions</li>
              <li>Provide real-time shipment tracking and delivery notifications via SMS, email, or in-app alerts</li>
              <li>Generate analytics reports, shipping insights, and performance dashboards</li>
              <li>Process COD remittances and reconcile payments</li>
              <li>Detect and prevent fraud, abuse, and unauthorized access to the Platform</li>
              <li>Improve the Platform&rsquo;s features, performance, and user experience</li>
              <li>Comply with legal obligations, tax requirements, and regulatory mandates</li>
              <li>Send service-related communications including account alerts, shipment updates, and policy changes</li>
            </ul>
            <p>End-customer (recipient) PII is used <em>only</em> to populate the carrier&rsquo;s airway bill (AWB) for the shipment the merchant has booked. It is never used for analytics, marketing, profiling, or shared beyond the specific carrier the merchant chose.</p>
          </section>

          <section>
            <h2>4. Legal Basis for Processing (GDPR)</h2>
            <p>For users protected by the EU General Data Protection Regulation, we rely on the following legal bases under GDPR Article 6:</p>
            <ul>
              <li><strong>Contract performance (Art. 6(1)(b)):</strong> Account, shipment, billing, and tracking data are processed because the processing is necessary to deliver the Platform you signed up for.</li>
              <li><strong>Legitimate interests (Art. 6(1)(f)):</strong> Fraud prevention, network security, analytics on aggregated data, and product improvement, balanced against your fundamental rights.</li>
              <li><strong>Legal obligation (Art. 6(1)(c)):</strong> Retention of shipment and financial records required by Indian tax and commerce law.</li>
              <li><strong>Consent (Art. 6(1)(a)):</strong> Optional analytics cookies and marketing communications, where applicable. You may withdraw consent at any time via your account settings or by emailing us.</li>
            </ul>
          </section>

          <section>
            <h2>5. Information Sharing</h2>
            <p>We share your information only in the following circumstances:</p>
            <ul>
              <li><strong>Courier partners:</strong> We share shipment details (sender/recipient information, addresses, package details) with courier partners to process and deliver your shipments. This is essential for service delivery.</li>
              <li><strong>Payment processors:</strong> We share necessary transaction information with our payment gateway providers (Razorpay/Cashfree) to process wallet top-ups and refunds.</li>
              <li><strong>E-commerce integrations:</strong> If you connect your store, we exchange order and fulfillment data with the respective platform as authorized by you.</li>
              <li><strong>Legal compliance:</strong> We may disclose information when required by law, court order, government authority, or to protect the rights, property, or safety of Blujay, our users, or the public.</li>
              <li><strong>Business transfers:</strong> In the event of a merger, acquisition, or sale of assets, your information may be transferred as part of the business assets.</li>
            </ul>
            <p>
              We do not sell, rent, or trade your personal information to third parties for marketing purposes. We do not share your data with advertisers.
            </p>
          </section>

          <section>
            <h2>6. Sub-processors</h2>
            <p>We engage the following sub-processors. Each is bound by a data processing agreement equivalent to the protections in this policy:</p>
            <ul>
              <li><strong>Google Cloud Platform / Firebase</strong> &mdash; primary database, authentication, serverless compute. Region: <code>asia-south1</code> (Mumbai). DPA: <a href="https://cloud.google.com/terms/data-processing-addendum" target="_blank" rel="noopener noreferrer">cloud.google.com/terms/data-processing-addendum</a></li>
              <li><strong>Vercel Inc.</strong> &mdash; application hosting and edge runtime. DPA: <a href="https://vercel.com/legal/dpa" target="_blank" rel="noopener noreferrer">vercel.com/legal/dpa</a></li>
              <li><strong>Razorpay Software Private Limited</strong> &mdash; wallet top-up payments. DPA: <a href="https://razorpay.com/dpa/" target="_blank" rel="noopener noreferrer">razorpay.com/dpa</a></li>
              <li><strong>Cashfree Payments India Private Limited</strong> &mdash; alternative wallet payment gateway (where enabled)</li>
              <li><strong>Shopify Inc.</strong> &mdash; source of order data when you integrate your Shopify store. DPA: <a href="https://www.shopify.com/legal/dpa" target="_blank" rel="noopener noreferrer">shopify.com/legal/dpa</a></li>
              <li><strong>Blue Dart Express Limited</strong> &mdash; courier (only when you choose Blue Dart for a shipment)</li>
              <li><strong>DTDC Express Limited (Shipsy Platform)</strong> &mdash; courier (only when you choose DTDC for a shipment)</li>
              <li><strong>Delhivery Limited</strong> &mdash; courier (when activated; only when you choose Delhivery for a shipment)</li>
              <li><strong>Email and SMS notification providers</strong> &mdash; for transactional shipment updates</li>
            </ul>
            <p>We will update this list when sub-processors change. Material changes are communicated via email to registered users at least 14 days in advance.</p>
          </section>

          <section>
            <h2>7. Data Storage, Security &amp; Retention</h2>
            <p>
              Your data is stored on secure cloud infrastructure hosted primarily in the <code>asia-south1</code> (Mumbai) region. We implement industry-standard security measures including:
            </p>
            <ul>
              <li>Encryption of data in transit (TLS 1.2+) and at rest (AES-256)</li>
              <li>Additional double-encryption of Shopify access tokens (AES-256-CBC with per-token random IV)</li>
              <li>Role-based access controls and multi-factor authentication for internal systems</li>
              <li>Regular security audits and vulnerability assessments</li>
              <li>Automated backup and disaster recovery procedures</li>
              <li>HMAC-SHA256 verification on every webhook before any payload is processed</li>
            </ul>
            <p>While we take reasonable measures to protect your data, no method of electronic storage or transmission is 100% secure. You are responsible for maintaining the security of your account credentials.</p>
            <p><strong>Retention periods:</strong></p>
            <ul>
              <li><strong>Account data:</strong> Duration of your account plus 3 years after closure</li>
              <li><strong>Shipment records (incl. recipient PII):</strong> 7 years &mdash; required by the Income Tax Act 1961 (Section 44AA) and the GST Act 2017 (Section 36)</li>
              <li><strong>Financial records:</strong> 8 years per the Companies Act 2013</li>
              <li><strong>Shopify access tokens:</strong> Until you uninstall the app or disconnect the integration; revoked and overwritten on uninstall</li>
              <li><strong>Log data:</strong> 12 months for security and analytics</li>
              <li><strong>Communication records:</strong> 2 years after resolution</li>
              <li><strong>Marketing/consent logs:</strong> 5 years (proof of consent under GDPR Art. 7(1))</li>
            </ul>
            <p>After the retention period, data is securely deleted or anonymized so that it can no longer be associated with you.</p>
          </section>

          <section>
            <h2>8. Cookies &amp; Tracking</h2>
            <p>We use the following types of cookies:</p>
            <ul>
              <li><strong>Essential cookies:</strong> Required for authentication, session management, and core Platform functionality. These cannot be disabled.</li>
              <li><strong>Analytics cookies:</strong> Help us understand how users interact with the Platform, which features are used most, and where users encounter issues. We use privacy-focused analytics that do not track users across websites.</li>
              <li><strong>Preference cookies:</strong> Remember your settings such as default pickup address, preferred courier, and dashboard layout.</li>
            </ul>
            <p>We do not use advertising or cross-site tracking cookies. You can manage cookie preferences through your browser settings.</p>
          </section>

          <section>
            <h2>9. Your Rights (GDPR &amp; DPDP)</h2>
            <p>You have the following rights regarding your personal data:</p>
            <ul>
              <li><strong>Access (GDPR Art. 15):</strong> Request a copy of the personal data we hold about you</li>
              <li><strong>Rectification (Art. 16):</strong> Request correction of inaccurate or incomplete personal data</li>
              <li><strong>Erasure (Art. 17):</strong> Request deletion of your personal data, subject to legal retention requirements</li>
              <li><strong>Restriction of processing (Art. 18):</strong> Request that we limit how we use your data while a dispute is being resolved</li>
              <li><strong>Data portability (Art. 20):</strong> Request an export of your shipment data and account information in a machine-readable format</li>
              <li><strong>Right to object (Art. 21):</strong> Object to processing based on legitimate interests, including direct marketing</li>
              <li><strong>Withdraw consent (Art. 7(3)):</strong> Withdraw consent for optional data processing at any time</li>
              <li><strong>Right to lodge a complaint:</strong> File a complaint with your local supervisory authority (e.g., the Information Commissioner&rsquo;s Office in the UK, your national data protection authority in the EU, or our Grievance Officer in India)</li>
            </ul>
            <p>To exercise any of these rights, contact us at <a href="mailto:blujaylsolution@gmail.com">blujaylsolution@gmail.com</a>. We respond within 30 days.</p>
          </section>

          <section>
            <h2>10. California Residents &mdash; CCPA Rights</h2>
            <p>If you are a California resident, you have the following rights under the California Consumer Privacy Act (CCPA), as amended by the California Privacy Rights Act (CPRA):</p>
            <ul>
              <li><strong>Right to know:</strong> Request the categories and specific pieces of personal information we have collected about you in the past 12 months</li>
              <li><strong>Right to delete:</strong> Request deletion of your personal information, subject to legal exceptions</li>
              <li><strong>Right to correct:</strong> Request correction of inaccurate personal information</li>
              <li><strong>Right to opt-out of sale or sharing:</strong> We do not sell or share personal information for cross-context behavioral advertising. Nothing to opt out of.</li>
              <li><strong>Right to limit sensitive personal information:</strong> We do not process sensitive personal information beyond what is strictly necessary for the requested service</li>
              <li><strong>Right to non-discrimination:</strong> We will not deny services, charge different prices, or provide a lower quality of service for exercising any CCPA right</li>
            </ul>
            <p>You may submit a request through an authorised agent; we will verify the agent&rsquo;s authority before processing. Email <a href="mailto:blujaylsolution@gmail.com">blujaylsolution@gmail.com</a> with subject line &ldquo;CCPA Request&rdquo;.</p>
          </section>

          <section>
            <h2>11. Shopify Integration &amp; Mandatory Privacy Webhooks</h2>
            <p>
              If you connect your Shopify store to Blujay, we access certain data through Shopify&rsquo;s API to provide our shipping and fulfillment services:
            </p>
            <h3>11.1 Data We Access</h3>
            <ul>
              <li><strong>Order data:</strong> Order details including order number, line items, quantities, prices, and shipping addresses (via <code>read_orders</code> scope)</li>
              <li><strong>Fulfillment data:</strong> We create fulfillment records with tracking information on your Shopify orders when shipments are booked (via <code>write_fulfillments</code> and <code>*_merchant_managed_fulfillment_orders</code> scopes)</li>
            </ul>
            <h3>11.2 How We Use Shopify Data</h3>
            <ul>
              <li>To import orders into our platform for shipment booking</li>
              <li>To sync tracking numbers and fulfillment status back to your Shopify store</li>
              <li>To display order details in your Blujay dashboard</li>
            </ul>
            <h3>11.3 Mandatory Compliance Webhooks</h3>
            <p>We honor every Shopify mandatory privacy webhook with HMAC-verified handlers and a documented 30-day fulfilment SLA:</p>
            <ul>
              <li><code>customers/data_request</code> &mdash; we package any data we hold for the named customer and deliver it to the merchant within 30 days</li>
              <li><code>customers/redact</code> &mdash; we anonymise the named customer&rsquo;s PII (name, phone, address) in our shipment records within 30 days; in practice, within minutes</li>
              <li><code>shop/redact</code> &mdash; on shop closure or 48 hours after uninstall, we anonymise all PII for the entire shop within 30 days; in practice, within hours</li>
            </ul>
            <h3>11.4 Revoking Access</h3>
            <p>You can disconnect your Shopify store at any time from the Integrations page in your Blujay dashboard. You can also uninstall the Blujay app directly from your Shopify admin panel.</p>
          </section>

          <section>
            <h2>12. International Data Transfers</h2>
            <p>Personal data is stored primarily in <code>asia-south1</code> (Mumbai, India). When data is transferred outside its region of origin (for example, edge logging via Vercel), we rely on the following safeguards:</p>
            <ul>
              <li><strong>EU Standard Contractual Clauses (2021 Module 2)</strong> for transfers from the European Economic Area</li>
              <li><strong>UK International Data Transfer Addendum (IDTA)</strong> for transfers from the United Kingdom</li>
              <li><strong>Adequacy decisions</strong> where applicable for the destination country</li>
              <li><strong>Sub-processor SCC reliance</strong> &mdash; each sub-processor is bound by SCCs incorporated into their respective DPAs (linked in Section 6)</li>
            </ul>
            <p>You may obtain a copy of the relevant transfer mechanism on request to <a href="mailto:blujaylsolution@gmail.com">blujaylsolution@gmail.com</a>.</p>
          </section>

          <section>
            <h2>13. Third-Party Links</h2>
            <p>
              The Platform may contain links to third-party websites or services (e.g., courier partner tracking pages). We are not responsible for the privacy practices of these third parties. We encourage you to review their privacy policies before providing any personal information.
            </p>
          </section>

          <section>
            <h2>14. Children&rsquo;s Privacy</h2>
            <p>
              The Platform is not intended for use by individuals under 16 years of age. We do not knowingly collect personal information from children. If we become aware that we have collected data from a child, we will take prompt steps to delete it. Parents or legal guardians may contact <a href="mailto:blujaylsolution@gmail.com">blujaylsolution@gmail.com</a> to request deletion.
            </p>
          </section>

          <section>
            <h2>15. Grievance Officer</h2>
            <p>
              In accordance with the Information Technology Act, 2000 and the rules made thereunder, the contact details of the Grievance Officer are:
            </p>
            <p>
              <strong>Grievance Officer</strong><br />
              Blujay Logistics Private Limited<br />
              6th Floor, Oh Park, Madhapur<br />
              Hyderabad, Telangana, India 500081<br />
              Email: <a href="mailto:blujaylsolution@gmail.com">blujaylsolution@gmail.com</a><br />
              Phone: +91 80 4567 8900
            </p>
            <p>
              The Grievance Officer shall acknowledge your complaint within 48 hours and resolve it within 30 days of receipt.
            </p>
          </section>

          <section>
            <h2>16. Contact Us</h2>
            <p>
              For any questions or concerns about this Privacy Policy, please contact us at:
            </p>
            <p>
              Email: <a href="mailto:blujaylsolution@gmail.com">blujaylsolution@gmail.com</a><br />
              Support: <a href="mailto:blujaylsolution@gmail.com">blujaylsolution@gmail.com</a><br />
              Phone: +91 80 4567 8900
            </p>
          </section>

          <section>
            <h2>17. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time to reflect changes in our practices, legal requirements, or Platform features. When we make material changes, we will update the &ldquo;Last updated&rdquo; date and notify registered users via email at least 7 days before the changes take effect.
            </p>
            <p><strong>Change log:</strong></p>
            <ul>
              <li><strong>April 29, 2026:</strong> Added GDPR Art. 6 legal basis (Sect. 4), sub-processor list (Sect. 6), CCPA rights (Sect. 10), explicit Shopify privacy webhook acknowledgment (Sect. 11.3), international transfer safeguards (Sect. 12), expanded data subject rights (Sect. 9), age threshold updated to 16, and Data Controller block.</li>
              <li><strong>January 29, 2026:</strong> Initial publication.</li>
            </ul>
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
        .prose-custom em {
          color: rgba(15, 23, 42, 0.55);
          font-style: italic;
        }
      `}</style>
    </div>
  );
}
