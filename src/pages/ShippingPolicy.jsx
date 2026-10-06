import React from "react";
import { Link } from "react-router-dom";
import { Truck, RotateCcw, ShieldCheck, Mail, Phone, HelpCircle, Clock, CheckCircle2 } from "lucide-react";
import { useDocumentMetadata } from "../hooks/useDocumentMetadata";
import "./ShippingPolicy.css";

function ShippingPolicy() {
  useDocumentMetadata(
    "Shipping and Refund Policy - Digital Sanskrit Guru",
    "Read our shipping, cancellation, returns, and refund policy for physical and digital products at Digital Sanskrit Guru."
  );

  return (
    <main className="policy-page">
      <div className="policy-container">
        {/* Header Hero Section */}
        <header className="policy-header">
          <span className="policy-badge">Customer Seva & Transparency</span>
          <h1 className="policy-title">Shipping & Refund Policy</h1>
          <p className="policy-subtitle">
            Customer happiness and satisfaction is our highest goal. Below is complete clarity on shipping timelines, cancellations, returns, and refunds.
          </p>
        </header>

        {/* Highlight Banner */}
        <div className="policy-alert-banner">
          <div className="alert-icon">📍</div>
          <div className="alert-text">
            <strong>Important Notice:</strong> Physical products (Books, Audio Devices, USBs, etc.) are shipped <strong>within India only</strong>. Digital products (E-books, Web/Flipbook versions & Courses) can be purchased <strong>worldwide</strong>.
          </div>
        </div>

        {/* Main Grid Content */}
        <div className="policy-grid">
          {/* Card 1: Shipping & Delivery */}
          <section className="policy-card" id="shipping-delivery">
            <div className="policy-card-header">
              <div className="card-icon-wrap">
                <Truck size={22} className="card-icon" />
              </div>
              <h2>Shipping & Delivery</h2>
            </div>
            <div className="policy-card-body">
              <ul className="policy-list">
                <li>
                  <CheckCircle2 size={16} className="list-icon" />
                  <span><strong>Delivery Timeline:</strong> We strive to deliver all products purchased from Vyoma Labs in excellent condition within <strong>1-week time</strong>.</span>
                </li>
                <li>
                  <CheckCircle2 size={16} className="list-icon" />
                  <span><strong>Shipping Charges:</strong> For all physical purchases, a standard shipping charge (approx. <strong>₹200</strong> depending on location and weight) will be applicable.</span>
                </li>
                <li>
                  <CheckCircle2 size={16} className="list-icon" />
                  <span><strong>Digital Products:</strong> E-books and Web Reader courses require no physical shipping and offer instant digital access upon payment completion.</span>
                </li>
              </ul>
            </div>
          </section>

          {/* Card 2: Order Cancellation */}
          <section className="policy-card" id="cancellations">
            <div className="policy-card-header">
              <div className="card-icon-wrap">
                <Clock size={22} className="card-icon" />
              </div>
              <h2>Order Cancellations</h2>
            </div>
            <div className="policy-card-body">
              <ul className="policy-list">
                <li>
                  <CheckCircle2 size={16} className="list-icon" />
                  <span><strong>24-Hour Window:</strong> You can cancel an order until it has been processed by calling our customer care within <strong>24 hours</strong> of placing the order (includes sale items).</span>
                </li>
                <li>
                  <CheckCircle2 size={16} className="list-icon" />
                  <span><strong>Cancellation Credit:</strong> For valid cancellations, the amount paid will be credited back into your account (excluding processing fee) within <strong>1-week time</strong>, depending on your card issuer’s policies.</span>
                </li>
                <li>
                  <CheckCircle2 size={16} className="list-icon" />
                  <span><strong>E-Learning Portals:</strong> Dissatisfied customers can request cancellation, which is evaluated on a case-by-case basis after speaking with the customer.</span>
                </li>
              </ul>
            </div>
          </section>

          {/* Card 3: Returns Policy */}
          <section className="policy-card" id="returns">
            <div className="policy-card-header">
              <div className="card-icon-wrap">
                <RotateCcw size={22} className="card-icon" />
              </div>
              <h2>Returns Policy</h2>
            </div>
            <div className="policy-card-body">
              <p className="policy-text">
                You have <strong>15 calendar days</strong> to return a physical item from the date you received it.
              </p>
              <ul className="policy-list">
                <li>
                  <CheckCircle2 size={16} className="list-icon" />
                  <span><strong>Item Condition:</strong> The item must be unused, undamaged, and in the exact same condition that you received it.</span>
                </li>
                <li>
                  <CheckCircle2 size={16} className="list-icon" />
                  <span><strong>Packaging:</strong> The product must be returned in its original packaging.</span>
                </li>
                <li>
                  <CheckCircle2 size={16} className="list-icon" />
                  <span><strong>Proof of Purchase:</strong> You must provide the receipt or valid proof of purchase.</span>
                </li>
              </ul>
            </div>
          </section>

          {/* Card 4: Refunds & Processing */}
          <section className="policy-card" id="refunds">
            <div className="policy-card-header">
              <div className="card-icon-wrap">
                <ShieldCheck size={22} className="card-icon" />
              </div>
              <h2>Refunds & Processing</h2>
            </div>
            <div className="policy-card-body">
              <ul className="policy-list">
                <li>
                  <CheckCircle2 size={16} className="list-icon" />
                  <span><strong>Inspection:</strong> Once your returned item is received, our team will inspect it and immediately notify you on the status of your refund.</span>
                </li>
                <li>
                  <CheckCircle2 size={16} className="list-icon" />
                  <span><strong>Payment Reversal:</strong> If approved, we will initiate a refund to your credit card or original payment method.</span>
                </li>
                <li>
                  <CheckCircle2 size={16} className="list-icon" />
                  <span><strong>Bank Timeline:</strong> Credit will reflect in your account within a certain number of days according to your card issuer/bank's policies.</span>
                </li>
              </ul>
            </div>
          </section>
        </div>

        {/* Audio Device Special Guarantee Box */}
        <section className="policy-special-box" id="audio-device-guarantee">
          <div className="special-head">
            <h3>⚡ Audio Device / Hardware - 15 Days Replacement Guarantee</h3>
          </div>
          <div className="special-body">
            <p>
              Vyoma Labs provides a <strong>Fifteen (15) days replacement guarantee</strong> for hardware / audio devices. In case of manufacturing failure of the audio device within 15 days of receipt, the device will be replaced free of charge.
            </p>
            <p className="special-note">
              <em>Note: Guarantee is void if failure is caused by improper usage, liquid ingress, accident, external fire, natural disaster, excessive shock, normal wear and tear, or environmental damage not attributable to product failure.</em>
            </p>
          </div>
        </section>

        {/* Customer Seva Contact Box */}
        <section className="policy-contact-box">
          <div className="contact-box-left">
            <h2>Customer Seva & Assistance</h2>
            <p>
              Customer happiness and satisfaction is our primary goal. If you have any queries or concerns, our support team is happy to assist you. All queries and complaints are answered within <strong>3 working days</strong>.
            </p>
          </div>
          <div className="contact-box-right">
            <div className="contact-item">
              <Phone size={20} className="contact-icon" />
              <div>
                <span className="contact-label">Call Us</span>
                <a href="tel:+919480865623" className="contact-val">+91-9480 865 623</a>
              </div>
            </div>
            <div className="contact-item">
              <Mail size={20} className="contact-icon" />
              <div>
                <span className="contact-label">Email Support</span>
                <a href="mailto:sanskritfromhome@vyomalabs.in" className="contact-val">sanskritfromhome@vyomalabs.in</a>
              </div>
            </div>
            <div className="contact-item">
              <HelpCircle size={20} className="contact-icon" />
              <div>
                <span className="contact-label">Need Help?</span>
                <Link to="/contact" className="contact-link">Contact Us Page →</Link>
              </div>
            </div>
          </div>
        </section>

        {/* Quick Navigation Links */}
        <div className="policy-footer-nav" style={{ display: "flex", justifyContent: "center", gap: "20px", flexWrap: "wrap", paddingTop: "20px", marginTop: "24px", borderTop: "1px solid var(--site-border, #e2e8f0)" }}>
          <Link to="/" className="contact-link">← Back to Store</Link>
          <Link to="/faq" className="contact-link">Help & FAQs</Link>
          <Link to="/terms-and-conditions" className="contact-link">Terms and Conditions</Link>
          <Link to="/privacy-policy" className="contact-link">Privacy Policy</Link>
          <Link to="/contact" className="contact-link">Contact Seva</Link>
        </div>
      </div>
    </main>
  );
}

export default ShippingPolicy;
