import { Link, useLocation } from "react-router-dom";
import {
  MapPin,
  Phone,
  Mail,
  ExternalLink,
  BookOpen,
  Globe,
  FileText,
  Download,
  Info
} from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { REGISTERED_OFFICE } from "../../utils/companyInfo";
import "./Footer.css";

function Footer() {
  const location = useLocation();
  const { user } = useAuth();

  if (location.pathname.startsWith("/admin")) {
    return null;
  }

  return (
    <footer className="site-footer">
      <div className="footer-container">
        <div className="footer-column">
          <div className="footer-col-header">
            <MapPin size={16} className="footer-col-icon" />
            <h3>Registered Office</h3>
          </div>
          <div className="footer-office-address">
            {REGISTERED_OFFICE.lines.map((line) => (
              <p key={line}>{line}</p>
            ))}
            <p className="footer-country-tag">{REGISTERED_OFFICE.country}</p>
          </div>
        </div>

        <div className="footer-column">
          <div className="footer-col-header">
            <Phone size={16} className="footer-col-icon" />
            <h3>Contact Us</h3>
          </div>
          <div className="footer-contact-list">
            <div className="contact-item">
              <span className="contact-label">Call Support</span>
              <a href="tel:+919480865623" className="contact-link">
                +91- 9480 865 623
              </a>
            </div>
            <div className="contact-item">
              <span className="contact-label">Email Inquiries</span>
              <a href="mailto:support@vyomalabs.in" className="contact-link">
                support@vyomalabs.in
              </a>
            </div>
          </div>
        </div>

        <div className="footer-column">
          <div className="footer-col-header">
            <Info size={16} className="footer-col-icon" />
            <h3>Quick Links</h3>
          </div>
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
        </div>

        <div className="footer-column">
          <div className="footer-col-header">
            <Globe size={16} className="footer-col-icon" />
            <h3>Our Portals</h3>
          </div>
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
        </div>

        <div className="footer-column">
          <div className="footer-col-header">
            <Download size={16} className="footer-col-icon" />
            <h3>Downloads</h3>
          </div>
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
        </div>
      </div>

      <div className="footer-bottom">
        <div className="footer-bottom-inner">
          <p>© {new Date().getFullYear()} Vyoma Linguistic Labs Foundation. All Rights Reserved.</p>
          <p className="footer-bottom-sub">Promoting authentic Sanskrit education, heritage literature & digital research.</p>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
