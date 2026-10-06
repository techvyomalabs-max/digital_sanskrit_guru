import React from "react";
import { Link } from "react-router-dom";
import { ShieldCheck, Lock, Eye, FileText, Globe, Phone, Mail, CheckCircle2, ExternalLink } from "lucide-react";
import { useDocumentMetadata } from "../hooks/useDocumentMetadata";
import "./PrivacyPolicy.css";

function PrivacyPolicy() {
  useDocumentMetadata(
    "Privacy Policy - Digital Sanskrit Guru | Vyoma Linguistic Labs Foundation",
    "Read the Privacy Policy of Digital Sanskrit Guru and Vyoma Linguistic Labs Foundation regarding data privacy, security, and usage."
  );

  return (
    <main className="policy-page privacy-policy-page">
      <div className="policy-container">
        {/* Header Hero Section */}
        <header className="policy-header">
          <span className="policy-badge">Data Protection & Privacy</span>
          <h1 className="policy-title">Privacy Policy</h1>
          <p className="policy-subtitle">
            Vyoma Linguistic Labs Foundation is committed to protecting your personal information and respecting your privacy across all our educational portals and digital learning tools.
          </p>
          <div className="privacy-meta-tags">
            <span>Effective Date: <strong>01/01/2023</strong></span>
            <span>•</span>
            <span>Last Updated: <strong>August 2023</strong></span>
          </div>
        </header>

        {/* Official Reference Banner */}
        <div className="policy-alert-banner privacy-source-banner">
          <div className="alert-icon">🏛️</div>
          <div className="alert-text">
            <strong>Official Organization Policy:</strong> Digital Sanskrit Guru is operated by <strong>Vyoma Linguistic Labs Foundation</strong> (a registered non-profit organization). This policy aligns with the official organization privacy governance available at{" "}
            <a
              href="https://vyoma.org/privacy/"
              target="_blank"
              rel="noopener noreferrer"
              className="privacy-source-link"
            >
              vyoma.org/privacy <ExternalLink size={13} style={{ display: "inline", verticalAlign: "middle" }} />
            </a>.
          </div>
        </div>

        {/* Main Grid Content */}
        <div className="policy-grid">
          {/* Card 1: Information We Collect */}
          <section className="policy-card" id="collection">
            <div className="policy-card-header">
              <div className="card-icon-wrap">
                <Eye size={22} className="card-icon" />
              </div>
              <h2>Information We Collect</h2>
            </div>
            <div className="policy-card-body">
              <p className="policy-text">
                When you browse our portal, purchase products, or register an account, we may collect the following information:
              </p>
              <ul className="policy-list">
                <li>
                  <CheckCircle2 size={16} className="list-icon" />
                  <span><strong>Personal Identifiers:</strong> Name, email address, phone/WhatsApp number, and billing/shipping addresses.</span>
                </li>
                <li>
                  <CheckCircle2 size={16} className="list-icon" />
                  <span><strong>Order & Transaction Records:</strong> Purchase history, license activation tokens, and delivery status. (Note: Payment card/UPI credentials are processed directly through secure PCI-DSS compliant gateways and are never stored on our servers).</span>
                </li>
                <li>
                  <CheckCircle2 size={16} className="list-icon" />
                  <span><strong>Technical Logs:</strong> IP address, device type, and browser details used for security auditing and website performance optimization.</span>
                </li>
              </ul>
            </div>
          </section>

          {/* Card 2: How We Use Your Data */}
          <section className="policy-card" id="usage">
            <div className="policy-card-header">
              <div className="card-icon-wrap">
                <FileText size={22} className="card-icon" />
              </div>
              <h2>How We Use Information</h2>
            </div>
            <div className="policy-card-body">
              <p className="policy-text">
                Your data is used strictly for fulfilling educational services and portal functionality:
              </p>
              <ul className="policy-list">
                <li>
                  <CheckCircle2 size={16} className="list-icon" />
                  <span><strong>Order Fulfillment:</strong> Processing book shipments, USB dispatch, and generating download links for software and courses.</span>
                </li>
                <li>
                  <CheckCircle2 size={16} className="list-icon" />
                  <span><strong>Customer Seva & Support:</strong> Providing technical assistance, installation guidance, and troubleshooting order inquiries.</span>
                </li>
                <li>
                  <CheckCircle2 size={16} className="list-icon" />
                  <span><strong>Service Communications:</strong> Order confirmations, OTP verification, shipment tracking updates, and educational announcements.</span>
                </li>
              </ul>
            </div>
          </section>

          {/* Card 3: Data Security & Non-Disclosure */}
          <section className="policy-card" id="security">
            <div className="policy-card-header">
              <div className="card-icon-wrap">
                <Lock size={22} className="card-icon" />
              </div>
              <h2>Data Security & Trust</h2>
            </div>
            <div className="policy-card-body">
              <p className="policy-text">
                We uphold the highest ethical standards regarding your personal data:
              </p>
              <ul className="policy-list">
                <li>
                  <CheckCircle2 size={16} className="list-icon" />
                  <span><strong>No Sale of Data:</strong> We never sell, rent, or trade your personal information to third-party commercial marketing agencies.</span>
                </li>
                <li>
                  <CheckCircle2 size={16} className="list-icon" />
                  <span><strong>SSL Encryption:</strong> All data transmissions between your browser and our servers are encrypted via industry-standard SSL (HTTPS).</span>
                </li>
                <li>
                  <CheckCircle2 size={16} className="list-icon" />
                  <span><strong>Trusted Partners:</strong> Data is shared only with verified logistics couriers (for shipping physical items) and payment gateways (for transaction processing).</span>
                </li>
              </ul>
            </div>
          </section>

          {/* Card 4: Cookies & User Rights */}
          <section className="policy-card" id="cookies-rights">
            <div className="policy-card-header">
              <div className="card-icon-wrap">
                <ShieldCheck size={22} className="card-icon" />
              </div>
              <h2>Cookies & Your Rights</h2>
            </div>
            <div className="policy-card-body">
              <ul className="policy-list">
                <li>
                  <CheckCircle2 size={16} className="list-icon" />
                  <span><strong>Essential Cookies:</strong> We utilize essential session cookies to remember your shopping cart items, theme preferences, and active login state.</span>
                </li>
                <li>
                  <CheckCircle2 size={16} className="list-icon" />
                  <span><strong>Access & Correction:</strong> You can review, update, or edit your account details at any time from the <Link to="/login">My Account</Link> dashboard.</span>
                </li>
                <li>
                  <CheckCircle2 size={16} className="list-icon" />
                  <span><strong>Data Deletion Requests:</strong> If you wish to request closure of your account or removal of personal records, write to us at support@digitalsanskritguru.com.</span>
                </li>
              </ul>
            </div>
          </section>
        </div>

        {/* Contact & Seva Help Box */}
        <section className="policy-contact-box">
          <div className="contact-box-header">
            <h3>Privacy Questions & Grievance Contact</h3>
            <p>If you have any questions or concerns regarding our privacy practices, our team is happy to assist you.</p>
          </div>
          <div className="contact-links-grid">
            <a href="mailto:support@digitalsanskritguru.com" className="contact-pill">
              <Mail size={16} />
              <span>support@digitalsanskritguru.com</span>
            </a>
            <a href="tel:+919480865623" className="contact-pill">
              <Phone size={16} />
              <span>+91 9480 865 623</span>
            </a>
            <a
              href="https://vyoma.org/privacy/"
              target="_blank"
              rel="noopener noreferrer"
              className="contact-pill external"
            >
              <Globe size={16} />
              <span>Visit Vyoma.org Privacy Portal</span>
            </a>
          </div>
        </section>

        {/* Quick Navigation Links */}
        <div className="policy-footer-nav">
          <Link to="/" className="policy-nav-link">← Back to Store</Link>
          <Link to="/faq" className="policy-nav-link">Help & FAQs</Link>
          <Link to="/terms-and-conditions" className="policy-nav-link">Terms and Conditions</Link>
          <Link to="/shipping-refund-policy" className="policy-nav-link">Shipping & Refund Policy</Link>
          <Link to="/contact" className="policy-nav-link">Contact Seva</Link>
        </div>
      </div>
    </main>
  );
}

export default PrivacyPolicy;
