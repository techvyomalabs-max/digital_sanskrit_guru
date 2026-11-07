import React from "react";
import { Link } from "react-router-dom";
import {
  MessageCircle,
  Phone,
  Mail,
  MapPin,
  Clock,
  ArrowRight,
  Package,
  Gift,
  MonitorPlay,
  Newspaper,
  Navigation
} from "lucide-react";
import { ORGANISATION_NAME, WORKING_OFFICE, formatAddressInline } from "../utils/companyInfo";
import "./Contact.css";

const SUPPORT_PHONE_DISPLAY = "+91 94808 65623";
const SUPPORT_PHONE_DIAL = "+919480865623";
const SUPPORT_EMAIL = "support@vyomalabs.in";
const WORKING_HOURS = "10 AM – 7 PM India Time (Mon to Sat)";
const WHATSAPP_URL = `https://wa.me/919480865623?text=${encodeURIComponent(
  "Hello Vyoma Customer Seva Team, my name is "
)}`;

const CONTACT_METHODS = [
  {
    key: "whatsapp",
    icon: MessageCircle,
    title: "Text / WhatsApp",
    value: SUPPORT_PHONE_DISPLAY,
    meta: WORKING_HOURS,
    desc: "Text to chat with the Vyoma Customer Seva Team. Please mention your name so we can save your contact details.",
    action: { label: "Chat on WhatsApp", href: WHATSAPP_URL, external: true }
  },
  {
    key: "call",
    icon: Phone,
    title: "Call Us",
    value: SUPPORT_PHONE_DISPLAY,
    meta: WORKING_HOURS,
    desc: "We are great listeners! Give us a ring during our working hours to talk to a representative.",
    action: { label: "Call now", href: `tel:${SUPPORT_PHONE_DIAL}` }
  },
  {
    key: "email",
    icon: Mail,
    title: "Email Us",
    value: SUPPORT_EMAIL,
    meta: "Response time: within 3 working days",
    desc: "Send us suggestions, general inquiries, or feedback. We respond to emails in the order they are received.",
    action: { label: "Send an email", href: `mailto:${SUPPORT_EMAIL}` }
  }
];

const EmailLink = () => <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>;

const INQUIRIES = [
  {
    icon: Package,
    title: "For Product Inquiries",
    body: (
      <>
        Browse products in our <Link to="/collection">Master Catalog</Link>, or send an email to <EmailLink />.
      </>
    )
  },
  {
    icon: Gift,
    title: "Bulk & Gifting Inquiries",
    body: (
      <>
        For bulk purchases or gifting options, email us at <EmailLink /> or call{" "}
        <a href={`tel:${SUPPORT_PHONE_DIAL}`}>{SUPPORT_PHONE_DISPLAY}</a>.
      </>
    )
  },
  {
    icon: MonitorPlay,
    title: "For Online Demos",
    body: (
      <>
        To book a customized demo, write to us at <EmailLink />. Our team will schedule an online demo with you within
        24 working hours.
      </>
    )
  },
  {
    icon: Newspaper,
    title: "Press & Media Inquiries",
    body: (
      <>
        Please direct all media and press inquiry emails to <EmailLink />.
      </>
    )
  }
];

function directionsUrl(address) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    `${ORGANISATION_NAME}, ${formatAddressInline(address)}`
  )}`;
}

function OfficeAddress({ address }) {
  return (
    <address className="office-address">
      <strong>{ORGANISATION_NAME}</strong>
      {[...address.lines, address.country].map((line) => (
        <React.Fragment key={line}>
          <br />
          {line}
        </React.Fragment>
      ))}
    </address>
  );
}

function Contact() {
  return (
    <div className="contact-page">
      <section className="contact-hero">
        <h1>Contact Us</h1>
        <p className="contact-hero-subtitle">
          We’re always ready to help you on your Sanskrit study journey!
        </p>
        <p className="contact-hero-hours">
          <Clock size={16} aria-hidden="true" />
          Customer Seva Team: {WORKING_HOURS}
        </p>
      </section>

      <div className="contact-container">
        <section className="contact-methods-grid" aria-label="Ways to reach us">
          {CONTACT_METHODS.map((method) => {
            const Icon = method.icon;
            return (
              <article key={method.key} className={`contact-method-card contact-method-${method.key}`}>
                <div className="contact-method-head">
                  <span className="contact-icon-wrap">
                    <Icon size={22} aria-hidden="true" />
                  </span>
                  <h2>{method.title}</h2>
                </div>
                <p className="contact-value">{method.value}</p>
                <p className="contact-hours">
                  <Clock size={15} aria-hidden="true" />
                  <span>{method.meta}</span>
                </p>
                <p className="contact-desc">{method.desc}</p>
                <a
                  className="contact-action"
                  href={method.action.href}
                  {...(method.action.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                >
                  {method.action.label}
                  <ArrowRight size={16} aria-hidden="true" />
                </a>
              </article>
            );
          })}
        </section>

        <section className="contact-inquiries-section" aria-labelledby="contact-inquiries-title">
          <h2 id="contact-inquiries-title">Specialized Inquiries</h2>
          <div className="inquiry-grid">
            {INQUIRIES.map((inquiry) => {
              const Icon = inquiry.icon;
              return (
                <div key={inquiry.title} className="inquiry-card">
                  <span className="inquiry-icon">
                    <Icon size={20} aria-hidden="true" />
                  </span>
                  <div>
                    <h3>{inquiry.title}</h3>
                    <p>{inquiry.body}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="contact-offices-section" aria-label="Our office">
          <article className="office-card">
            <div className="office-card-body">
              <h2>
                <span className="office-icon">
                  <MapPin size={18} aria-hidden="true" />
                </span>
                {WORKING_OFFICE.title}
              </h2>
              <OfficeAddress address={WORKING_OFFICE} />
            </div>
            <div className="office-card-aside">
              <p className="office-visit-note">
                You can visit us during working hours, {WORKING_HOURS}, to buy products in person.
              </p>
              <a className="office-directions" href={directionsUrl(WORKING_OFFICE)} target="_blank" rel="noopener noreferrer">
                <Navigation size={15} aria-hidden="true" />
                Get directions
              </a>
            </div>
          </article>
        </section>
      </div>
    </div>
  );
}

export default Contact;
