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
import "./Footer.css";

function Footer() {
  const location = useLocation();

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
            <p>#155, 2nd floor, 4th Cross,</p>
            <p>GKW Layout, Vijayanagar,</p>
            <p>Bengaluru, Karnataka – 560040</p>
            <p className="footer-country-tag">India</p>
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
              <a href="mailto:sanskritfromhome@vyomalabs.in" className="contact-link">
                sanskritfromhome@vyomalabs.in
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
              <a href="#/faq">FAQ</a>
            </li>
            <li>
              <Link to="/login">My Account</Link>
            </li>
            <li>
              <a href="terms_and_condtions.html" target="_blank" rel="noopener noreferrer">
                Terms and Conditions
              </a>
            </li>
            <li>
              <a href="privacy.html" target="_blank" rel="noopener noreferrer">
                Privacy Policy
              </a>
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
              <a href="https://www.vyomalabs.in" target="_blank" rel="noopener noreferrer" className="footer-ext-link">
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
              <a href="#/downloads/presentation" className="footer-ext-link">
                <FileText size={13} />
                <span>Company Presentation</span>
              </a>
            </li>
            <li>
              <a href="#/downloads/newsletter" className="footer-ext-link">
                <FileText size={13} />
                <span>Vyoma Newsletter</span>
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
