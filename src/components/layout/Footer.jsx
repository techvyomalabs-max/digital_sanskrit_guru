import { useCallback, useState, useSyncExternalStore } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  MapPin,
  Phone,
  Mail,
  ExternalLink,
  Globe,
  FileText,
  Download,
  Info,
  ChevronDown
} from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { WORKING_OFFICE } from "../../utils/companyInfo";
import { FacebookIcon, InstagramIcon, LinkedinIcon, XIcon, YoutubeIcon } from "../common/SocialIcons";
import "./Footer.css";

const SOCIAL_LINKS = [
  { name: "Facebook", href: "https://www.facebook.com/digitalsanskritguru", icon: FacebookIcon, color: "#1877f2" },
  { name: "Instagram", href: "https://www.instagram.com/digital_sanskrit_guru/", icon: InstagramIcon, color: "#e1306c" },
  { name: "X (Twitter)", href: "https://x.com/VyomaSanskrit", icon: XIcon, color: "#e2e8f0" },
  { name: "LinkedIn", href: "https://www.linkedin.com/company/vyoma-linguistic-labs-foundation/", icon: LinkedinIcon, color: "#0a66c2" },
  { name: "YouTube", href: "https://www.youtube.com/@vyoma-samskrta-pathasala", icon: YoutubeIcon, color: "#ff0033" }
];

const SUPPORT_PHONE_DISPLAY = "+91- 9480 865 623";
const SUPPORT_PHONE_DIAL = "+919480865623";
const SUPPORT_EMAIL = "support@vyomalabs.in";

// Phones get the compact, collapsible footer; must match the CSS breakpoint
const COMPACT_FOOTER_QUERY = "(max-width: 768px)";

function subscribeToCompactQuery(onChange) {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mql = window.matchMedia(COMPACT_FOOTER_QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

function readCompactQuery() {
  return typeof window !== "undefined" && window.matchMedia
    ? window.matchMedia(COMPACT_FOOTER_QUERY).matches
    : false;
}

function useCompactFooter() {
  return useSyncExternalStore(subscribeToCompactQuery, readCompactQuery, () => false);
}

/**
 * A footer column. On desktop the heading is static and the content always shows.
 * On phones the heading becomes a toggle and the content collapses.
 */
function FooterSection({ id, icon, title, isCompact, isOpen, onToggle, className = "", children }) {
  const Icon = icon;
  const bodyId = `footer-section-${id}`;
  const expanded = !isCompact || isOpen;

  return (
    <div className={`footer-column ${className}${expanded ? " is-open" : ""}`}>
      {isCompact ? (
        <h3 className="footer-col-heading">
          <button
            type="button"
            className="footer-col-header footer-col-toggle"
            aria-expanded={isOpen}
            aria-controls={bodyId}
            onClick={() => onToggle(id)}
          >
            <Icon size={16} className="footer-col-icon" aria-hidden="true" />
            <span className="footer-col-title">{title}</span>
            <ChevronDown size={18} className="footer-col-chevron" aria-hidden="true" />
          </button>
        </h3>
      ) : (
        <div className="footer-col-header">
          <Icon size={16} className="footer-col-icon" aria-hidden="true" />
          <h3>{title}</h3>
        </div>
      )}
      <div id={bodyId} className="footer-col-body" hidden={!expanded}>
        {children}
      </div>
    </div>
  );
}

function Footer() {
  const location = useLocation();
  const { user } = useAuth();
  const isCompact = useCompactFooter();
  const [openSection, setOpenSection] = useState(null);

  const toggleSection = useCallback((id) => {
    setOpenSection((current) => (current === id ? null : id));
  }, []);

  if (location.pathname.startsWith("/admin")) {
    return null;
  }

  const sectionProps = (id) => ({
    id,
    isCompact,
    isOpen: openSection === id,
    onToggle: toggleSection
  });

  return (
    <footer className={`site-footer${isCompact ? " is-compact" : ""}`}>
      {isCompact && (
        <div className="footer-quick-contact" aria-label="Contact support">
          <a href={`tel:${SUPPORT_PHONE_DIAL}`} className="footer-quick-btn">
            <Phone size={18} aria-hidden="true" />
            <span>
              <span className="footer-quick-label">Call support</span>
              <span className="footer-quick-value">{SUPPORT_PHONE_DISPLAY}</span>
            </span>
          </a>
          <a href={`mailto:${SUPPORT_EMAIL}`} className="footer-quick-btn">
            <Mail size={18} aria-hidden="true" />
            <span>
              <span className="footer-quick-label">Email us</span>
              <span className="footer-quick-value">{SUPPORT_EMAIL}</span>
            </span>
          </a>
        </div>
      )}

      <div className="footer-container">
        <FooterSection {...sectionProps("office")} icon={MapPin} title={WORKING_OFFICE.title}>
          <div className="footer-office-address">
            {WORKING_OFFICE.lines.map((line) => (
              <p key={line}>{line}</p>
            ))}
            <p className="footer-country-tag">{WORKING_OFFICE.country}</p>
          </div>
        </FooterSection>

        {/* On phones the call/email buttons above replace this column */}
        {!isCompact && (
          <FooterSection {...sectionProps("contact")} icon={Phone} title="Contact Us">
            <div className="footer-contact-list">
              <div className="contact-item">
                <span className="contact-label">Call Support</span>
                <a href={`tel:${SUPPORT_PHONE_DIAL}`} className="contact-link">
                  {SUPPORT_PHONE_DISPLAY}
                </a>
              </div>
              <div className="contact-item">
                <span className="contact-label">Email Inquiries</span>
                <a href={`mailto:${SUPPORT_EMAIL}`} className="contact-link">
                  {SUPPORT_EMAIL}
                </a>
              </div>
            </div>
          </FooterSection>
        )}

        <FooterSection {...sectionProps("links")} icon={Info} title="Quick Links" className="footer-column-links">
          <ul className="footer-nav-list">
            <li>
              <Link to="/about">About Us</Link>
            </li>
            <li>
              <Link to="/faq">FAQ</Link>
            </li>
            <li>
              <Link to={user ? "/account" : "/login"}>My Account</Link>
            </li>
            <li>
              <Link to="/terms-and-conditions">Terms and Conditions</Link>
            </li>
            <li>
              <Link to="/privacy-policy">Privacy Policy</Link>
            </li>
            <li>
              <Link to="/shipping-refund-policy">Shipping & Refund Policy</Link>
            </li>
            <li>
              <Link to="/contact">Contact Us</Link>
            </li>
          </ul>
        </FooterSection>

        <FooterSection {...sectionProps("portals")} icon={Globe} title="Our Portals" className="footer-column-portals">
          <ul className="footer-nav-list">
            <li>
              <a href="https://vyoma.org" target="_blank" rel="noopener noreferrer" className="footer-ext-link">
                <span>Vyoma Labs (India)</span>
                <ExternalLink size={12} />
              </a>
            </li>
            <li>
              <a href="https://www.vyomausa.org" target="_blank" rel="noopener noreferrer" className="footer-ext-link">
                <span>Vyoma Labs (USA)</span>
                <ExternalLink size={12} />
              </a>
            </li>
            <li>
              <a href="https://www.sanskritfromhome.org" target="_blank" rel="noopener noreferrer" className="footer-ext-link">
                <span>Learn Sanskrit From Home</span>
                <ExternalLink size={12} />
              </a>
            </li>
          </ul>
        </FooterSection>

        <FooterSection {...sectionProps("downloads")} icon={Download} title="Downloads" className="footer-column-downloads">
          <ul className="footer-nav-list">
            <li>
              <a
                href="/downloads/vyoma-product-publication-catalogue.pdf"
                download="Vyoma Product and Publication Catalogue.pdf"
                className="footer-ext-link"
              >
                <FileText size={13} />
                <span>Product & Publication Catalogue</span>
              </a>
            </li>
          </ul>
        </FooterSection>
      </div>

      <div className="footer-bottom">
        <div className="footer-bottom-inner">
          <nav className="footer-social" aria-label="Follow us on social media">
            <span className="footer-social-label">Follow us</span>
            <ul className="footer-social-list">
              {SOCIAL_LINKS.map((social) => {
                const Icon = social.icon;
                return (
                  <li key={social.name}>
                    <a
                      href={social.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="footer-social-link"
                      style={{ "--social-color": social.color }}
                      aria-label={`${social.name} (opens in a new tab)`}
                      title={social.name}
                    >
                      <Icon size={20} aria-hidden="true" />
                    </a>
                  </li>
                );
              })}
            </ul>
          </nav>
          <p>© {new Date().getFullYear()} Vyoma Linguistic Labs Foundation. All Rights Reserved.</p>
          <p className="footer-bottom-sub">Promoting authentic Sanskrit education, heritage literature & digital research.</p>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
