import React from "react";
import { Link } from "react-router-dom";
import { BookOpen, ShieldCheck, Scale, AlertCircle, Globe, Phone, Mail, CheckCircle2, ExternalLink } from "lucide-react";
import { useDocumentMetadata } from "../hooks/useDocumentMetadata";
import "./TermsAndConditions.css";

function TermsAndConditions() {
  useDocumentMetadata(
    "Terms and Conditions - Digital Sanskrit Guru | Vyoma Linguistic Labs Foundation",
    "Read the Terms and Conditions of Digital Sanskrit Guru and Vyoma Linguistic Labs Foundation regarding product usage, intellectual property, and service terms."
  );

  return (
    <main className="policy-page terms-policy-page">
      <div className="policy-container">
        {/* Header Hero Section */}
        <header className="policy-header">
          <span className="policy-badge terms-badge">Terms of Service</span>
          <h1 className="policy-title">Terms and Conditions</h1>
          <p className="policy-subtitle">
            Welcome to Digital Sanskrit Guru. By accessing our website, purchasing our Sanskrit learning products, or enrolling in digital courses, you agree to the terms and guidelines outlined below.
          </p>
          <div className="terms-meta-tags">
            <span>Effective Date: <strong>01/01/2023</strong></span>
            <span>•</span>
            <span>Last Updated: <strong>August 2023</strong></span>
          </div>
        </header>

        {/* Official Reference Banner */}
        <div className="policy-alert-banner terms-source-banner">
          <div className="alert-icon">📜</div>
          <div className="alert-text">
            <strong>Official Organization Terms:</strong> Digital Sanskrit Guru is an educational portal by <strong>Vyoma Linguistic Labs Foundation</strong> (Section 8 Non-Profit Organization). This portal adheres to the official organization terms and conditions available at{" "}
            <a
              href="https://vyoma.org/terms/"
              target="_blank"
              rel="noopener noreferrer"
              className="terms-source-link"
            >
              vyoma.org/terms <ExternalLink size={13} style={{ display: "inline", verticalAlign: "middle" }} />
            </a>.
          </div>
        </div>

        {/* Main Grid Content */}
        <div className="policy-grid">
          {/* Card 1: Acceptance & Portal Usage */}
          <section className="policy-card" id="acceptance">
            <div className="policy-card-header">
              <div className="card-icon-wrap terms-icon-wrap">
                <BookOpen size={22} className="card-icon" />
              </div>
              <h2>Acceptance of Terms</h2>
            </div>
            <div className="policy-card-body">
              <p className="policy-text">
                By browsing our store, creating an account, or purchasing educational materials, you agree to be legally bound by these terms:
              </p>
              <ul className="policy-list">
                <li>
                  <CheckCircle2 size={16} className="list-icon" />
                  <span><strong>Eligibility:</strong> You must be at least 18 years of age or accessing under the supervision of a parent/guardian to place orders.</span>
                </li>
                <li>
                  <CheckCircle2 size={16} className="list-icon" />
                  <span><strong>Account Security:</strong> You are responsible for maintaining the confidentiality of your login credentials and all activities occurring under your account.</span>
                </li>
                <li>
                  <CheckCircle2 size={16} className="list-icon" />
                  <span><strong>Lawful Use:</strong> You agree not to use the website for any unlawful, deceptive, or unauthorized purposes.</span>
                </li>
              </ul>
            </div>
          </section>

          {/* Card 2: Intellectual Property & Copyright */}
          <section className="policy-card" id="intellectual-property">
            <div className="policy-card-header">
              <div className="card-icon-wrap terms-icon-wrap">
                <ShieldCheck size={22} className="card-icon" />
              </div>
              <h2>Intellectual Property & Licensing</h2>
            </div>
            <div className="policy-card-body">
              <p className="policy-text">
                All content on this portal is the proprietary intellectual property of Vyoma Linguistic Labs Foundation:
              </p>
              <ul className="policy-list">
                <li>
                  <CheckCircle2 size={16} className="list-icon" />
                  <span><strong>Copyright Protection:</strong> All Sanskrit multimedia lessons, audio recordings, software packages, flipbooks, illustrations, and pedagogical materials are protected by copyright laws.</span>
                </li>
                <li>
                  <CheckCircle2 size={16} className="list-icon" />
                  <span><strong>Single-User License:</strong> Product purchases grant a single, non-exclusive, non-transferable personal learning license.</span>
                </li>
                <li>
                  <CheckCircle2 size={16} className="list-icon" />
                  <span><strong>Duplication Prohibited:</strong> Commercial copying, redistribution, public broadcasting, USB duplication, or reverse engineering of software without prior written consent is strictly prohibited.</span>
                </li>
              </ul>
            </div>
          </section>

          {/* Card 3: Orders, Pricing & Delivery */}
          <section className="policy-card" id="orders-pricing">
            <div className="policy-card-header">
              <div className="card-icon-wrap terms-icon-wrap">
                <Scale size={22} className="card-icon" />
              </div>
              <h2>Orders, Pricing & Digital Delivery</h2>
            </div>
            <div className="policy-card-body">
              <p className="policy-text">
                Terms governing orders and digital product fulfillment:
              </p>
              <ul className="policy-list">
                <li>
                  <CheckCircle2 size={16} className="list-icon" />
                  <span><strong>Transparent Pricing:</strong> Product prices are clearly listed in INR (and international currencies where applicable). Taxes and applicable shipping fees are displayed before checkout.</span>
                </li>
                <li>
                  <CheckCircle2 size={16} className="list-icon" />
                  <span><strong>Instant Digital Activation:</strong> Web reader access and download links are provisioned automatically upon payment confirmation.</span>
                </li>
                <li>
                  <CheckCircle2 size={16} className="list-icon" />
                  <span><strong>Physical Dispatch:</strong> Physical books and USBs are dispatched within 2–3 business days via reputable postal/courier services.</span>
                </li>
              </ul>
            </div>
          </section>

          {/* Card 4: Disclaimers & Governing Law */}
          <section className="policy-card" id="disclaimers">
            <div className="policy-card-header">
              <div className="card-icon-wrap terms-icon-wrap">
                <AlertCircle size={22} className="card-icon" />
              </div>
              <h2>Disclaimers & Governing Law</h2>
            </div>
            <div className="policy-card-body">
              <ul className="policy-list">
                <li>
                  <CheckCircle2 size={16} className="list-icon" />
                  <span><strong>Educational Purpose:</strong> All materials are provided in good faith for non-commercial educational and cultural enrichment.</span>
                </li>
                <li>
                  <CheckCircle2 size={16} className="list-icon" />
                  <span><strong>Jurisdiction:</strong> These terms are governed by the laws of India. Any legal proceedings shall be subject to the exclusive jurisdiction of courts in <strong>Bengaluru, Karnataka</strong>.</span>
                </li>
                <li>
                  <CheckCircle2 size={16} className="list-icon" />
                  <span><strong>Policy Amendments:</strong> Vyoma Foundation reserves the right to update these terms periodically to reflect operational, legal, or regulatory updates.</span>
                </li>
              </ul>
            </div>
          </section>
        </div>

        {/* Contact & Seva Help Box */}
        <section className="policy-contact-box">
          <div className="contact-box-header">
            <h3>Questions Regarding Terms?</h3>
            <p>If you have questions regarding institutional licensing, group access, or general terms, our team is happy to assist you.</p>
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
              href="https://vyoma.org/terms/"
              target="_blank"
              rel="noopener noreferrer"
              className="contact-pill external"
            >
              <Globe size={16} />
              <span>Visit Vyoma.org Terms Portal</span>
            </a>
          </div>
        </section>

        {/* Quick Navigation Links */}
        <div className="policy-footer-nav">
          <Link to="/" className="policy-nav-link">← Back to Store</Link>
          <Link to="/faq" className="policy-nav-link">Help & FAQs</Link>
          <Link to="/privacy-policy" className="policy-nav-link">Privacy Policy</Link>
          <Link to="/shipping-refund-policy" className="policy-nav-link">Shipping & Refund Policy</Link>
          <Link to="/contact" className="policy-nav-link">Contact Seva</Link>
        </div>
      </div>
    </main>
  );
}

export default TermsAndConditions;
