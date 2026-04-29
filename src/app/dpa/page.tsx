'use client';

import Link from 'next/link';
import { Package, ArrowLeft } from 'lucide-react';

export default function DPAPage() {
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
          <h1 className="text-3xl sm:text-4xl font-bold text-[#0f172a] tracking-[-0.03em] mb-3">Data Processing Addendum</h1>
          <p className="text-[14px] text-[#0f172a]/40">Last updated: April 30, 2026</p>
        </div>

        <div className="prose-custom space-y-10">
          <section>
            <h2>1. Introduction</h2>
            <p>
              This Data Processing Addendum (&ldquo;DPA&rdquo;) forms part of the agreement between Blujay Logistics Private Limited (&ldquo;Blujay,&rdquo; &ldquo;Processor&rdquo;) and the merchant or business entity using the Blujay Logistics platform (&ldquo;Customer,&rdquo; &ldquo;Controller&rdquo;) and governs the processing of Personal Data carried out by Blujay on behalf of the Customer in connection with the Blujay Logistics services (the &ldquo;Services&rdquo;).
            </p>
            <p>
              This DPA is incorporated by reference into our <Link href="/terms">Terms &amp; Conditions</Link> and supplements our <Link href="/privacy">Privacy Policy</Link>. Where this DPA conflicts with the Terms, this DPA prevails for matters relating to the processing of Personal Data.
            </p>
          </section>

          <section>
            <h2>2. Definitions</h2>
            <ul>
              <li><strong>&ldquo;Applicable Data Protection Laws&rdquo;</strong> means the EU General Data Protection Regulation 2016/679 (GDPR), the UK GDPR and the Data Protection Act 2018, the California Consumer Privacy Act as amended by the CPRA (CCPA), the Indian Digital Personal Data Protection Act 2023 (DPDP Act), and any other data-protection laws applicable to the Customer.</li>
              <li><strong>&ldquo;Personal Data&rdquo;</strong> means any information relating to an identified or identifiable natural person processed by Blujay on behalf of the Customer in connection with the Services.</li>
              <li><strong>&ldquo;Data Subject&rdquo;</strong> means the natural person to whom Personal Data relates &mdash; including merchants&rsquo; end customers (recipients of shipments).</li>
              <li><strong>&ldquo;Sub-processor&rdquo;</strong> means any third party engaged by Blujay to process Personal Data on its behalf.</li>
              <li><strong>&ldquo;Standard Contractual Clauses&rdquo; (SCCs)</strong> means the EU Commission Implementing Decision (EU) 2021/914 of 4 June 2021 standard contractual clauses (Module 2: Controller to Processor), as may be updated.</li>
              <li><strong>&ldquo;UK IDTA&rdquo;</strong> means the UK International Data Transfer Addendum to the EU SCCs issued by the Information Commissioner&rsquo;s Office.</li>
            </ul>
          </section>

          <section>
            <h2>3. Roles &amp; Subject Matter</h2>
            <p>
              For the purposes of this DPA, the Customer is the Controller of Personal Data and Blujay is the Processor. Where the Customer transfers to Blujay Personal Data of which a third party is the controller, the Customer represents that it has the legal authority to instruct Blujay to process such data on the third party&rsquo;s behalf.
            </p>
            <p><strong>Subject matter:</strong> Provision of the Blujay Logistics shipping aggregation, label-generation, tracking and fulfilment services.</p>
            <p><strong>Duration:</strong> For the term of the agreement and any post-termination retention required by Applicable Data Protection Laws or Indian tax/commerce statutes (see Privacy Policy &sect;7).</p>
            <p><strong>Nature and purpose of processing:</strong> Storing, transmitting, transforming and delivering Personal Data to the carrier of the Customer&rsquo;s choice in order to fulfil shipments booked by the Customer.</p>
          </section>

          <section>
            <h2>4. Categories of Personal Data &amp; Data Subjects</h2>
            <p><strong>Categories of Personal Data processed:</strong></p>
            <ul>
              <li>Recipient (end-customer) name, phone, full delivery address, postal code, country</li>
              <li>Sender (merchant) name, contact details, pickup address, GSTIN</li>
              <li>Order metadata: order number, items, declared value, weight, dimensions</li>
              <li>Shipment events: AWB number, status updates, scan history, proof of delivery</li>
              <li>Account data: merchant email, hashed password, role, IP and session metadata</li>
              <li>Shopify access tokens (encrypted at rest with AES-256-CBC and a per-record IV)</li>
            </ul>
            <p><strong>Categories of Data Subjects:</strong></p>
            <ul>
              <li>Merchants (and their employees) who hold Blujay accounts</li>
              <li>End customers (recipients) of shipments booked through the Services</li>
            </ul>
          </section>

          <section>
            <h2>5. Processor Obligations</h2>
            <p>Blujay shall:</p>
            <ul>
              <li>Process Personal Data only on the Customer&rsquo;s documented instructions, including those given by configuring the Services through the Blujay dashboard or API</li>
              <li>Ensure that personnel authorised to process Personal Data are bound by confidentiality obligations</li>
              <li>Implement and maintain the technical and organisational security measures described in Section 9 below</li>
              <li>Engage Sub-processors only in accordance with Section 6</li>
              <li>Taking into account the nature of the processing, assist the Customer with appropriate technical and organisational measures in fulfilling the Customer&rsquo;s obligations to respond to Data Subject rights requests</li>
              <li>Assist the Customer in complying with its security, breach notification, data-protection impact assessment and prior consultation obligations under Applicable Data Protection Laws</li>
              <li>At the Customer&rsquo;s choice, delete or return all Personal Data after the end of the provision of services, subject to legally mandated retention</li>
              <li>Make available to the Customer all information necessary to demonstrate compliance with this DPA, and allow for and contribute to audits as described in Section 11</li>
            </ul>
          </section>

          <section>
            <h2>6. Sub-processors</h2>
            <p>
              The Customer authorises Blujay to engage the Sub-processors listed in &sect;6 of our <Link href="/privacy">Privacy Policy</Link>. The current list includes Google Cloud Platform / Firebase (asia-south1, Mumbai), Vercel Inc., Razorpay, Cashfree (where enabled), Shopify, the carriers chosen by the merchant on a per-shipment basis (Blue Dart, DTDC, Delhivery), and email/SMS notification providers. Each Sub-processor is bound by data-protection terms substantially equivalent to those in this DPA.
            </p>
            <p>
              Blujay shall give the Customer at least 14 days&rsquo; prior notice (by email and/or in-app notice) of any intended changes concerning the addition or replacement of Sub-processors. The Customer may object to a Sub-processor change on reasonable, documented grounds; if the parties cannot agree, the Customer may terminate the affected Services.
            </p>
          </section>

          <section>
            <h2>7. International Data Transfers</h2>
            <p>
              Personal Data is stored primarily in <code>asia-south1</code> (Mumbai, India). Where Personal Data is transferred outside of the European Economic Area, the United Kingdom, or other regions imposing transfer restrictions, the parties rely on the following safeguards:
            </p>
            <ul>
              <li>The <strong>EU Standard Contractual Clauses (Module 2: Controller to Processor)</strong> as approved by the European Commission Implementing Decision (EU) 2021/914 of 4 June 2021, the terms of which are hereby incorporated into this DPA by reference</li>
              <li>The <strong>UK International Data Transfer Addendum</strong> issued by the Information Commissioner&rsquo;s Office, as applicable</li>
              <li><strong>Adequacy decisions</strong> where applicable for the destination country</li>
              <li>Sub-processor onward transfers are governed by SCCs incorporated into the relevant Sub-processor agreements</li>
            </ul>
            <p>The completed SCC docking clauses (Annexes I, II and III) are deemed populated as set out in Annex A of this DPA, available on request.</p>
          </section>

          <section>
            <h2>8. Data Subject Rights</h2>
            <p>
              Taking into account the nature of the processing, Blujay shall assist the Customer by appropriate technical and organisational measures, insofar as possible, for the fulfilment of the Customer&rsquo;s obligation to respond to requests for exercising the Data Subject&rsquo;s rights laid down in Chapter III of the GDPR (and equivalents under DPDP, CCPA and other applicable laws).
            </p>
            <p>
              For Customers who connect their Shopify store, Blujay specifically honours the three Shopify mandatory privacy webhooks &mdash; <code>customers/data_request</code>, <code>customers/redact</code>, and <code>shop/redact</code> &mdash; with HMAC-verified handlers and a documented 30-day fulfilment SLA. In practice, redactions are processed within minutes of webhook receipt.
            </p>
          </section>

          <section>
            <h2>9. Security Measures</h2>
            <p>Blujay implements and maintains the following technical and organisational security measures:</p>
            <ul>
              <li><strong>Encryption in transit:</strong> TLS 1.2+ for all API and webhook traffic</li>
              <li><strong>Encryption at rest:</strong> AES-256 (Google Cloud-managed) on Firestore; additional AES-256-CBC double-encryption with per-record random IV applied to Shopify access tokens</li>
              <li><strong>Authentication:</strong> Firebase Authentication with role-based claims; multi-factor authentication for administrative access</li>
              <li><strong>Network security:</strong> Vercel-managed edge with DDoS protection; HMAC-SHA256 verification on every Shopify webhook before any payload is parsed; length-checked timing-safe HMAC comparison to prevent malformed-attack bypass</li>
              <li><strong>Access controls:</strong> Production data accessible only to founder/engineering on a least-privilege basis; all access logged via Google Cloud Audit Logs</li>
              <li><strong>Data minimisation:</strong> Recipient PII persisted only at fields appearing on a printed AWB; never aggregated across merchants; never used for analytics or marketing</li>
              <li><strong>Backups &amp; disaster recovery:</strong> Automated Firestore exports retained per the retention schedule</li>
              <li><strong>Vulnerability management:</strong> Periodic dependency-update sweeps; security review of every change touching authentication or webhook code paths</li>
            </ul>
          </section>

          <section>
            <h2>10. Personal Data Breach Notification</h2>
            <p>
              Blujay shall notify the Customer without undue delay, and in any event within <strong>72 hours</strong> after becoming aware of a Personal Data breach affecting the Customer&rsquo;s data. The notification shall, at a minimum, describe the nature of the breach, the categories and approximate number of data subjects and records concerned, the likely consequences, and the measures taken or proposed to be taken to address the breach and to mitigate its possible adverse effects.
            </p>
            <p>
              Blujay maintains an incident-response process and audit trail. The Customer is solely responsible for any onward notification obligations to its own data subjects or supervisory authorities.
            </p>
          </section>

          <section>
            <h2>11. Audits</h2>
            <p>
              On reasonable prior written request (no more than once per twelve months, except after a confirmed Personal Data breach), Blujay shall make available to the Customer all information reasonably necessary to demonstrate compliance with this DPA. Where a Customer reasonably requires more detailed information, the parties may agree on an audit protocol that protects Blujay&rsquo;s confidential information and operational continuity.
            </p>
          </section>

          <section>
            <h2>12. Return or Deletion of Personal Data</h2>
            <p>
              On termination of the Services, the Customer may direct Blujay either to return Personal Data in a commonly used machine-readable format or to delete it. Blujay shall comply within 60 days, except where retention is required by applicable law (e.g. Indian Income Tax Act and GST Act, as set out in our Privacy Policy &sect;7). Personal Data retained for legal reasons remains subject to the security measures of this DPA.
            </p>
          </section>

          <section>
            <h2>13. Liability</h2>
            <p>
              Each party&rsquo;s liability under this DPA is subject to the limitations and exclusions of liability set out in the Terms. To the extent any term of this DPA is held invalid by a court or supervisory authority, the remaining terms continue in full force.
            </p>
          </section>

          <section>
            <h2>14. Governing Law &amp; Jurisdiction</h2>
            <p>
              This DPA is governed by the laws of India and subject to the exclusive jurisdiction of the courts in Hyderabad, Telangana. Where the SCCs apply, the SCCs&rsquo; own choice-of-law and forum provisions govern matters within their scope.
            </p>
          </section>

          <section>
            <h2>15. Contact</h2>
            <p>
              For questions about this DPA, requests for the populated SCC annexes, or to give instructions concerning the processing of Personal Data, contact:
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
