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
          <p className="text-[14px] text-[#0f172a]/40">Last updated: January 29, 2026</p>
        </div>

        <div className="prose-custom space-y-10">
          <section>
            <h2>1. Introduction</h2>
            <p>
              Blujay Logistics Private Limited (&ldquo;Blujay,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;) is committed to protecting the privacy and security of your personal information. This Privacy Policy explains how we collect, use, store, share, and protect your data when you use our courier aggregation platform (&ldquo;Platform&rdquo;) and related services.
            </p>
            <p>
              This policy complies with the Information Technology Act, 2000, the Information Technology (Reasonable Security Practices and Procedures and Sensitive Personal Data or Information) Rules, 2011, and applicable data protection regulations in India.
            </p>
          </section>

          <section>
            <h2>2. Information We Collect</h2>
            <p>We collect the following types of information:</p>

            <h3>2.1 Information You Provide</h3>
            <ul>
              <li><strong>Account information:</strong> Name, email address, phone number, company name, GSTIN, and password when you register</li>
              <li><strong>Shipping information:</strong> Sender and recipient names, addresses, phone numbers, pin codes, and shipment details (weight, dimensions, contents description)</li>
              <li><strong>Payment information:</strong> Bank account details, UPI IDs, and transaction records for wallet top-ups and COD remittances (we do not store credit/debit card numbers &mdash; these are handled by our PCI-DSS compliant payment processor)</li>
              <li><strong>Business information:</strong> Company registration details, pickup addresses, default shipping preferences</li>
              <li><strong>Communication data:</strong> Support tickets, emails, chat messages, and feedback submitted through the Platform</li>
            </ul>

            <h3>2.2 Information Collected Automatically</h3>
            <ul>
              <li><strong>Usage data:</strong> Pages visited, features used, search queries, shipment history, and interaction patterns on the Platform</li>
              <li><strong>Device information:</strong> Browser type, operating system, device identifiers, screen resolution, and language preferences</li>
              <li><strong>Log data:</strong> IP addresses, access timestamps, referring URLs, and error logs</li>
              <li><strong>Cookies:</strong> Session cookies, authentication tokens, and analytics cookies (see Section 7)</li>
            </ul>

            <h3>2.3 Information from Third Parties</h3>
            <ul>
              <li><strong>Courier partners:</strong> Shipment status updates, delivery confirmations, proof of delivery, weight discrepancy data, and COD collection details</li>
              <li><strong>Payment providers:</strong> Transaction confirmation and payment status</li>
              <li><strong>E-commerce platforms:</strong> Order details if you integrate your Shopify, WooCommerce, or other store with Blujay</li>
            </ul>
          </section>

          <section>
            <h2>3. How We Use Your Information</h2>
            <p>We use the information we collect to:</p>
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
          </section>

          <section>
            <h2>4. Information Sharing</h2>
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
            <h2>5. Data Storage & Security</h2>
            <p>
              Your data is stored on secure cloud infrastructure hosted in India. We implement industry-standard security measures including:
            </p>
            <ul>
              <li>Encryption of data in transit (TLS 1.2+) and at rest (AES-256)</li>
              <li>Role-based access controls and multi-factor authentication for internal systems</li>
              <li>Regular security audits and vulnerability assessments</li>
              <li>Automated backup and disaster recovery procedures</li>
              <li>Secure API authentication using API keys and OAuth tokens</li>
            </ul>
            <p>
              While we take reasonable measures to protect your data, no method of electronic storage or transmission is 100% secure. You are responsible for maintaining the security of your account credentials.
            </p>
          </section>

          <section>
            <h2>6. Data Retention</h2>
            <p>We retain your information for as long as your account is active or as needed to provide our services. Specific retention periods:</p>
            <ul>
              <li><strong>Account data:</strong> Retained for the duration of your account plus 3 years after closure</li>
              <li><strong>Shipment records:</strong> Retained for 7 years as required by Indian tax and commerce regulations</li>
              <li><strong>Financial records:</strong> Retained for 8 years as required by applicable financial regulations</li>
              <li><strong>Log data:</strong> Retained for 12 months for security and analytics purposes</li>
              <li><strong>Communication records:</strong> Retained for 2 years after resolution</li>
            </ul>
            <p>
              After the retention period, data is securely deleted or anonymized so that it can no longer be associated with you.
            </p>
          </section>

          <section>
            <h2>7. Cookies & Tracking</h2>
            <p>We use the following types of cookies:</p>
            <ul>
              <li><strong>Essential cookies:</strong> Required for authentication, session management, and core Platform functionality. These cannot be disabled.</li>
              <li><strong>Analytics cookies:</strong> Help us understand how users interact with the Platform, which features are used most, and where users encounter issues. We use privacy-focused analytics that do not track users across websites.</li>
              <li><strong>Preference cookies:</strong> Remember your settings such as default pickup address, preferred courier, and dashboard layout.</li>
            </ul>
            <p>
              We do not use advertising or cross-site tracking cookies. You can manage cookie preferences through your browser settings.
            </p>
          </section>

          <section>
            <h2>8. Your Rights</h2>
            <p>You have the following rights regarding your personal data:</p>
            <ul>
              <li><strong>Access:</strong> Request a copy of the personal data we hold about you</li>
              <li><strong>Correction:</strong> Request correction of inaccurate or incomplete personal data</li>
              <li><strong>Deletion:</strong> Request deletion of your personal data, subject to legal retention requirements</li>
              <li><strong>Data portability:</strong> Request an export of your shipment data and account information in a machine-readable format</li>
              <li><strong>Withdraw consent:</strong> Withdraw consent for optional data processing (e.g., analytics cookies) at any time</li>
              <li><strong>Grievance:</strong> File a complaint with our Grievance Officer (details below)</li>
            </ul>
            <p>
              To exercise any of these rights, contact us at <a href="mailto:privacy@blujaylogistics.in">privacy@blujaylogistics.in</a>. We will respond to your request within 30 days.
            </p>
          </section>

          <section>
            <h2>9. Shopify Integration & Data Handling</h2>
            <p>
              If you connect your Shopify store to Blujay, we access certain data through Shopify&rsquo;s API to provide our shipping and fulfillment services:
            </p>
            <h3>9.1 Data We Access</h3>
            <ul>
              <li><strong>Order data:</strong> Order details including order number, line items, quantities, prices, and shipping addresses (via <code>read_orders</code> scope)</li>
              <li><strong>Fulfillment data:</strong> We create fulfillment records with tracking information on your Shopify orders when shipments are booked (via <code>write_fulfillments</code> scope)</li>
            </ul>
            <h3>9.2 How We Use Shopify Data</h3>
            <ul>
              <li>To import orders into our platform for shipment booking</li>
              <li>To sync tracking numbers and fulfillment status back to your Shopify store</li>
              <li>To display order details in your Blujay dashboard</li>
            </ul>
            <h3>9.3 Data Deletion & GDPR Compliance</h3>
            <p>
              We comply with Shopify&rsquo;s mandatory GDPR webhook requirements. When a customer requests data deletion or when you uninstall the Blujay app:
            </p>
            <ul>
              <li><strong>Customer data requests:</strong> We process data export requests within 30 days</li>
              <li><strong>Customer data deletion:</strong> We anonymize all personal information (names, addresses, phone numbers) in shipment records within 30 days</li>
              <li><strong>App uninstall:</strong> We revoke access and mark the connection as inactive. After 48 hours, Shopify triggers a shop data redaction request, and we anonymize all associated data</li>
            </ul>
            <h3>9.4 Revoking Access</h3>
            <p>
              You can disconnect your Shopify store at any time from the Integrations page in your Blujay dashboard. You can also uninstall the Blujay app directly from your Shopify admin panel.
            </p>
          </section>

          <section>
            <h2>10. Third-Party Links</h2>
            <p>
              The Platform may contain links to third-party websites or services (e.g., courier partner tracking pages). We are not responsible for the privacy practices of these third parties. We encourage you to review their privacy policies before providing any personal information.
            </p>
          </section>

          <section>
            <h2>11. Children&rsquo;s Privacy</h2>
            <p>
              The Platform is not intended for use by individuals under 18 years of age. We do not knowingly collect personal information from children. If we become aware that we have collected data from a child, we will take steps to delete it promptly.
            </p>
          </section>

          <section>
            <h2>12. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time to reflect changes in our practices, legal requirements, or Platform features. When we make material changes, we will update the &ldquo;Last updated&rdquo; date and notify registered users via email at least 7 days before the changes take effect.
            </p>
          </section>

          <section>
            <h2>13. Grievance Officer</h2>
            <p>
              In accordance with the Information Technology Act, 2000 and the rules made thereunder, the contact details of the Grievance Officer are:
            </p>
            <p>
              <strong>Grievance Officer</strong><br />
              Blujay Logistics Private Limited<br />
              Koramangala, Bangalore<br />
              Karnataka, India 560034<br />
              Email: <a href="mailto:privacy@blujaylogistics.in">privacy@blujaylogistics.in</a><br />
              Phone: +91 80 4567 8900
            </p>
            <p>
              The Grievance Officer shall acknowledge your complaint within 48 hours and resolve it within 30 days of receipt.
            </p>
          </section>

          <section>
            <h2>14. Contact Us</h2>
            <p>
              For any questions or concerns about this Privacy Policy, please contact us at:
            </p>
            <p>
              Email: <a href="mailto:privacy@blujaylogistics.in">privacy@blujaylogistics.in</a><br />
              Support: <a href="mailto:support@blujaylogistics.in">support@blujaylogistics.in</a><br />
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
      `}</style>
    </div>
  );
}
