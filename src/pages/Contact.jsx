import React from "react";
import { Link } from "react-router-dom";
import { MessageCircle, Phone, Mail, Video, MapPin, Briefcase } from "lucide-react";
import { ORGANISATION_NAME, REGISTERED_OFFICE, WORKING_OFFICE } from "../utils/companyInfo";
import "./Contact.css";

function OfficeAddress({ address }) {
  return (
    <p>
      <strong>{ORGANISATION_NAME}</strong>
      {[...address.lines, address.country].map((line) => (
        <React.Fragment key={line}>
          <br />
          {line}
        </React.Fragment>
      ))}
    </p>
  );
}

function Contact() {
  return (
    <div className="contact-page">
      {/* Hero Section */}
      <section className="contact-hero">
        <h1>Contact Us</h1>
        <p className="contact-hero-subtitle">
          We’re always ready to help you on your Sanskrit study journey!
        </p>
      </section>

      {/* Main Container */}
      <div className="contact-container">
        {/* Core Contact Methods */}
        <div className="contact-methods-grid">
          {/* Card 1: Text / WhatsApp */}
          <article className="contact-method-card">
            <div className="contact-icon-wrap">
              <MessageCircle size={24} />
            </div>
            <h3>Text / WhatsApp</h3>
            <p className="contact-value">+91 94808 65623</p>
            <p className="contact-hours">10 AM – 7 PM India Time (Mon to Sat)</p>
            <p className="contact-desc">
              Text to chat with the Vyoma Customer Seva Team. Please mention your name so we can save your contact details.
            </p>
          </article>

          {/* Card 2: Call Us */}
          <article className="contact-method-card">
            <div className="contact-icon-wrap">
              <Phone size={24} />
            </div>
            <h3>Call Us</h3>
            <p className="contact-value">+91 94808 65623</p>
            <p className="contact-hours">10 AM – 7 PM India Time (Mon to Sat)</p>
            <p className="contact-desc">
              We are great listeners! Give us a ring during our working hours to talk to a representative.
            </p>
          </article>

          {/* Card 3: Email Us */}
          <article className="contact-method-card">
            <div className="contact-icon-wrap">
              <Mail size={24} />
            </div>
            <h3>Email Us</h3>
            <p className="contact-value">
              <a href="mailto:support@vyomalabs.in">support@vyomalabs.in</a>
            </p>
            <p className="contact-hours">Response time: within 3 working days</p>
            <p className="contact-desc">
              Send us suggestions, general inquiries, or feedback. We respond to emails in the order they are received.
            </p>
          </article>

          {/* Card 4: Skype ID */}
          <article className="contact-method-card">
            <div className="contact-icon-wrap">
              <Video size={24} />
            </div>
            <h3>Skype Chat</h3>
            <p className="contact-value">Skype ID: Vyoma Labs</p>
            <p className="contact-hours">10 AM – 7 PM India Time (Mon to Sat)</p>
            <p className="contact-desc">
              Ask your question right now with a member of the Customer Seva Team directly through Skype.
            </p>
          </article>
        </div>

        {/* Specific Inquiries Section */}
        <section className="contact-inquiries-section">
          <h2>Specialized Inquiries</h2>
          <div className="inquiry-grid">
            <div className="inquiry-card">
              <h3>For Product Inquiries</h3>
              <p>
                Browse products in our <Link to="/collection">Master Catalog</Link>, or send an email to{" "}
                <a href="mailto:support@vyomalabs.in">support@vyomalabs.in</a>.
              </p>
            </div>

            <div className="inquiry-card">
              <h3>Bulk & Gifting Inquiries</h3>
              <p>
                For bulk purchases or gifting options, email us at{" "}
                <a href="mailto:support@vyomalabs.in">support@vyomalabs.in</a> or call{" "}
                <strong>+91 94808 65623</strong>.
              </p>
            </div>

            <div className="inquiry-card">
              <h3>For Online Demos</h3>
              <p>
                To book a customized demo, write to us. Our team will schedule an online demo with you within 24 working hours.
              </p>
            </div>

            <div className="inquiry-card">
              <h3>Press & Media Inquiries</h3>
              <p>
                Please direct all media and press inquiry emails to{" "}
                <a href="mailto:support@vyomalabs.in">support@vyomalabs.in</a>.
              </p>
            </div>
          </div>
        </section>

        {/* Office Locations */}
        <div className="contact-offices-section">
          {/* Registered Office */}
          <article className="office-card">
            <h2>
              <MapPin size={20} /> {REGISTERED_OFFICE.title}
            </h2>
            <OfficeAddress address={REGISTERED_OFFICE} />
          </article>

          {/* Working Office */}
          <article className="office-card">
            <h2>
              <Briefcase size={20} /> {WORKING_OFFICE.title}
            </h2>
            <OfficeAddress address={WORKING_OFFICE} />
          </article>
        </div>
      </div>
    </div>
  );
}

export default Contact;