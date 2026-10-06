import { useState, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import "./FAQ.css";

const FAQ_CATEGORIES = [
  {
    id: "learning-journey",
    name: "Learning Journey & Fluency",
    shortName: "Learning Journey",
    tagline: "Beginners roadmap, conversational Sanskrit, combos & scripture study",
    color: "#2563eb",
    icon: "📖",
    questions: [
      {
        id: "q-g1",
        question: "What does Digital Sanskrit Guru stand for?",
        answer:
          "Vyoma offers digital Sanskrit learning for interested learners at all levels. This learning is in the form of Courses, Self-learning tools (interchangeably called products here) and books. Digital Sanskrit Guru is a one-stop portal to explore and purchase all products created by the Vyoma team.",
        tags: ["About", "Vyoma", "Overview"],
        actionUrl: "https://vyoma.org/about/",
        actionLabel: "🌐 Visit Vyoma.org"
      },
      {
        id: "q-p2",
        question: "I am an absolute beginner. What qualification is required?",
        answer:
          "No prior Sanskrit qualification is required! We offer entry-level tools for absolute beginners (alphabet recognition, audio pronunciation, and basic chanting) as well as intermediate and advanced grammar packs.",
        tags: ["Beginners", "Prerequisites", "Eligibility"]
      },
      {
        id: "q-p1",
        question: "What is the recommended path for learning Sanskrit?",
        answer:
          "Standard progression recommended by Vyoma scholars:\n1. Alphabets & Pronunciation (Varnamala)\n2. Basic Shlokas & Chanting\n3. Conversational / Spoken Sanskrit\n4. Basic Sanskrit Grammar (Vyakarana)\n5. Advanced Scripture & Literature Study.\n\nFor a personalized roadmap tailored to your goals, write to our academic team at support@digitalsanskritguru.com.",
        tags: ["Roadmap", "Guidance", "Progression"]
      },
      {
        id: "q-p3",
        question: "Can I speak fluently in Sanskrit using these products?",
        answer:
          "Yes! We offer specialized Spoken Sanskrit and conversational products that teach everyday vocabulary, sentence structures, and dialogues with native audio pronunciation guides.",
        tags: ["Spoken Sanskrit", "Fluency", "Conversation"]
      },
      {
        id: "q-p4",
        question: "Will I be able to understand Sanskrit scriptures and Upanishads?",
        answer:
          "Yes. Our foundational grammar and shloka packs introduce sentence syntax and sandhi/samasa basics. Once comfortable, we recommend scripture study courses on SanskritFromHome that train you to interpret classical texts directly.",
        tags: ["Scriptures", "Upanishads", "Gita", "Advanced"],
        actionUrl: "https://www.sanskritfromhome.org",
        actionLabel: "🎓 Explore Scripture Courses"
      },
      {
        id: "q-p5",
        question: "Which learning combo packs are available?",
        answer:
          "We offer curated learning combos including:\n1. Stress relief & peace of mind with Sanskrit chanting.\n2. Concentration & memory enhancement for students.\n3. Basic Sanskrit Shlokas & Stotras bundle.\n4. Step-by-step Basic Sanskrit Grammar structure.\n5. Advanced Vyakarana fundamentals.\n6. Complete Sanskrit Language + Grammar combo pack.",
        tags: ["Combos", "Bundles", "Curriculum"]
      }
    ]
  },
  {
    id: "media-formats",
    name: "Product Formats & Media",
    shortName: "Media & Formats",
    tagline: "USB pen drives, downloadable Windows offline, Web & Flipbooks",
    color: "#8b5cf6",
    icon: "💿",
    questions: [
      {
        id: "q-p7",
        question: "What are the different delivery formats available for products?",
        answer:
          "We provide versatile learning formats to suit your preferences:\n• Web Version: Instant browser access on any device (Windows, Mac, iOS, Android).\n• Downloadable Offline Version: Download once to Windows PC and run forever without internet.\n• USB Flash Drive: Secure pre-loaded pen drive shipped to your address (India & US).\n• Paperback Books: Printed physical textbooks (India delivery).\n• Flipbooks: Interactive digital flipping books readable on web browsers.",
        tags: ["Formats", "USB", "Download", "Web", "Books"]
      },
      {
        id: "q-p6",
        question: "Which languages are explanations available in?",
        answer:
          "Instruction and meanings are provided in English, Sanskrit, and select regional Indian languages (Hindi, Kannada, Tamil, Telugu) depending on the specific module.",
        tags: ["Languages", "English", "Hindi", "Tamil", "Kannada"]
      },
      {
        id: "q-p8",
        question: "Do you offer certificates upon course completion?",
        answer:
          "Yes, we provide structured online assessments and course completion certificates. For evaluation guidelines and certification requests, email support@digitalsanskritguru.com.",
        tags: ["Certificates", "Assessment"]
      },
      {
        id: "q-p9",
        question: "Where can I see a live demo of the products before purchasing?",
        answer:
          "You can request an interactive demo or guided presentation by reaching out to our seva team at support@digitalsanskritguru.com.",
        tags: ["Demo", "Preview", "Trial"]
      }
    ]
  },
  {
    id: "tech-setup",
    name: "Technical Support & Devices",
    shortName: "Tech & Setup",
    tagline: "macOS compatibility, mobile setup, ZIP extraction & USB care",
    color: "#ef4444",
    icon: "💻",
    questions: [
      {
        id: "q-t7",
        question: "How do I extract and run downloadable software on Windows?",
        answer:
          "Quick 3-step extraction guide:\n1. Download the ZIP file from your order confirmation email or My Account.\n2. Right-click the downloaded ZIP file and choose 'Extract All...'.\n3. Open the extracted folder and run the Application (.exe).\n\nDownload step-by-step PDF guide with screenshots: https://digitalsanskritguru.com/wp-content/uploads/2020/09/Steps-to-Extract-method-downloadable-version.pdf",
        tags: ["Download", "ZIP", "Extraction", "Windows"],
        actionUrl: "https://digitalsanskritguru.com/wp-content/uploads/2020/09/Steps-to-Extract-method-downloadable-version.pdf",
        actionLabel: "📥 Download Extraction PDF Guide"
      },
      {
        id: "q-t1",
        question: "I have an Apple Mac (macOS). Will your products work on Mac?",
        answer:
          "Yes! Web-version products, online courses, and flipbooks run seamlessly in any browser on macOS (Safari, Chrome, Firefox).\n\nNote: Downloadable .exe files are for Windows only. For Mac users, please select the Web Version or Flipbook format.",
        tags: ["Mac", "macOS", "Apple", "Safari"],
        actionUrl: "https://digitalsanskritguru.com/shop/?filter_cat_1=25",
        actionLabel: "🍎 Browse macOS Ready Catalog"
      },
      {
        id: "q-t2",
        question: "I don't have a computer. Can I learn on Mobile or Tablet?",
        answer:
          "Yes, all our Web Versions, online courses (Sanskrit From Home), and flipbooks are responsive and work smoothly on smartphones, iPads, and Android tablets.",
        tags: ["Mobile", "iPad", "Tablet", "Android", "iOS"]
      },
      {
        id: "q-t3",
        question: "Do I need an active internet connection to learn?",
        answer:
          "• Web Versions & Courses: Require internet connectivity.\n• Downloadable Version & USB Drive: Work 100% offline without any internet connection once activated on Windows PC.",
        tags: ["Internet", "Offline Mode", "Standalone"]
      },
      {
        id: "q-t4",
        question: "Can I copy the USB contents to another hard drive or computer?",
        answer:
          "No, the USB content is digitally protected and configured to run securely directly from the USB drive to prevent unauthorized duplication.",
        tags: ["USB", "Copy Protection", "License"]
      },
      {
        id: "q-t5",
        question: "What should I do if my USB is damaged or fails to run?",
        answer:
          "Contact support@digitalsanskritguru.com with your order details. Our technical seva team will diagnose the issue and either ship a replacement USB or provide complimentary Web Version access.",
        tags: ["Hardware", "Replacement", "Support"]
      }
    ]
  },
  {
    id: "payments-orders",
    name: "Payments & Order Guidance",
    shortName: "Payments & Orders",
    tagline: "UPI, International cards, ordering guide & physical store",
    color: "#10b981",
    icon: "💳",
    questions: [
      {
        id: "q-pay2",
        question: "What payment methods are accepted?",
        answer:
          "We accept:\n• UPI (Google Pay, PhonePe, Paytm, BHIM)\n• Credit & Debit Cards (Visa, Mastercard, RuPay, Amex)\n• Net Banking (all major Indian banks)\n• Direct Bank Transfer (NEFT / RTGS / IMPS)\n• Cheques / DDs drawn in favor of 'Vyoma Linguistic Labs Foundation'.",
        tags: ["UPI", "Cards", "NetBanking", "Cheque"]
      },
      {
        id: "q-pay3",
        question: "I do not have a credit card. How can I complete my order?",
        answer:
          "You can easily pay via UPI QR code, Net Banking, or Direct Bank Transfer (NEFT/IMPS). You can also send a Cheque or Demand Draft directly to our Bangalore office.",
        tags: ["No Credit Card", "UPI", "Bank Transfer"]
      },
      {
        id: "q-pay1",
        question: "How do I purchase products on Digital Sanskrit Guru?",
        answer:
          "You can browse our online store, add products to your cart, and check out securely through our online catalog at: https://digitalsanskritguru.com",
        tags: ["Buy", "Cart", "Checkout"],
        actionUrl: "https://digitalsanskritguru.com",
        actionLabel: "🛍️ Browse Products"
      },
      {
        id: "q-g8",
        question: "Is there a step-by-step PDF guide for placing an order?",
        answer:
          "Yes, we have a helpful illustrated PDF guide explaining the entire checkout process: https://digitalsanskritguru.com/wp-content/uploads/2020/10/Procedure_for_downloadable_link.pdf",
        tags: ["Guide", "Ordering PDF", "How to Order"],
        actionUrl: "https://digitalsanskritguru.com/wp-content/uploads/2020/10/Procedure_for_downloadable_link.pdf",
        actionLabel: "📥 Download Checkout Guide (PDF)"
      },
      {
        id: "q-pay5",
        question: "Are your products available for learners outside India?",
        answer:
          "Yes! All digital formats (Web Versions, Downloadable Offline Links, Flipbooks) are delivered instantly worldwide. Physical books and USB drives are also shipped internationally (US & overseas shipping applicable).",
        tags: ["International", "Global", "USA", "Worldwide"]
      },
      {
        id: "q-pay4",
        question: "Can I buy products in person at a physical store or center?",
        answer:
          "Yes, you can directly visit our physical center and purchase products:\nVyoma Linguistic Labs Foundation\nNo 84, 3rd Cross, N G E F Layout, 2nd Block, Opp Fortis Hospital, Nagarabhavi, Bengaluru 560072.",
        tags: ["Physical Store", "Walk-in", "Bengaluru"],
        actionUrl: "https://maps.google.com/?q=Vyoma+Linguistic+Labs+Foundation+Bengaluru",
        actionLabel: "📍 Google Maps Location"
      },
      {
        id: "q-pay-shipping",
        question: "What is your Shipping, Delivery and Refund Policy?",
        answer:
          "Digital downloads and web versions are activated immediately upon successful payment. Physical items (USB drives, Books) are packed and dispatched with care via reputed courier partners within 2-3 working days across India and internationally. For complete details on order dispatch, tracking, replacement guarantees, and refunds, please review our official policy page.",
        tags: ["Shipping", "Delivery", "Refund", "Returns"],
        isInternalLink: true,
        actionUrl: "/shipping-refund-policy",
        actionLabel: "📦 View Shipping & Refund Policy"
      }
    ]
  },
  {
    id: "about-vyoma",
    name: "About Vyoma & Portals",
    shortName: "About Vyoma",
    tagline: "Organization mission, leadership scholars & online courses",
    color: "#f59e0b",
    icon: "🏛️",
    questions: [
      {
        id: "q-g2",
        question: "What is the organization behind these tools and products?",
        answer:
          "All these products, courses, and educational tools are developed by Vyoma Linguistic Labs Foundation, a non-profit organization dedicated to making Sanskrit learning accessible, structured, and enjoyable globally.",
        tags: ["Foundation", "Non-Profit", "Mission"]
      },
      {
        id: "q-g5",
        question: "Who are the scholars and team behind these products?",
        answer:
          "Our core team consists of distinguished Sanskrit scholars, educational researchers, software engineers, and passionate volunteers. You can meet our leadership and advisors at: https://vyoma.org/about/",
        tags: ["Team", "Scholars", "Leadership"],
        actionUrl: "https://vyoma.org/about/",
        actionLabel: "👥 Meet Our Scholars & Team"
      },
      {
        id: "q-g6",
        question: "Do you have an organization brochure?",
        answer:
          "Yes! Our brochure detailing our educational initiatives, digital tools, and mission impact can be downloaded here: https://digitalsanskritguru.com/wp-content/uploads/2020/08/Vyoma-Sanskrit-Movement-2020-DSG-website.pdf",
        tags: ["Brochure", "PDF", "Downloads"],
        actionUrl: "https://digitalsanskritguru.com/wp-content/uploads/2020/08/Vyoma-Sanskrit-Movement-2020-DSG-website.pdf",
        actionLabel: "📥 Download Organization Brochure (PDF)"
      },
      {
        id: "q-g7",
        question: "Where do I access the live and self-paced courses by Vyoma Labs?",
        answer:
          "You can explore, register for, and attend our structured online courses at our dedicated Sanskrit learning portal: https://www.sanskritfromhome.org",
        tags: ["Courses", "Sanskrit From Home", "Live Classes"],
        actionUrl: "https://www.sanskritfromhome.org",
        actionLabel: "🎓 Visit SanskritFromHome.org"
      },
      {
        id: "q-g-privacy",
        question: "What is your data privacy policy?",
        answer:
          "Vyoma Linguistic Labs Foundation upholds strict data protection ethics. We never sell or share your personal data with third-party advertisers. All transactions are SSL-encrypted, and we comply with India's DPDP Act 2023 and GDPR guidelines. Read our full policy at /privacy-policy or view the foundation policy at https://vyoma.org/privacy/.",
        tags: ["Privacy", "Security", "GDPR", "DPDP"],
        isInternalLink: true,
        actionUrl: "/privacy-policy",
        actionLabel: "🔒 View Privacy Policy"
      },
      {
        id: "q-g-terms",
        question: "Where can I view the Terms and Conditions for product usage and licensing?",
        answer:
          "All digital learning tools, downloads, and books are copyrighted by Vyoma Linguistic Labs Foundation for personal educational use. You can read our full terms on product licensing, single-user access, and orders at /terms-and-conditions or view the official foundation terms at https://vyoma.org/terms/.",
        tags: ["Terms", "Conditions", "Licensing", "Copyright"],
        isInternalLink: true,
        actionUrl: "/terms-and-conditions",
        actionLabel: "📜 View Terms and Conditions"
      }
    ]
  }
];

export default function FAQ() {
  const [activeCategoryId, setActiveCategoryId] = useState("learning-journey");
  const [activeQuestionId, setActiveQuestionId] = useState("q-g1");
  const [copied, setCopied] = useState(false);
  const [helpfulFeedback, setHelpfulFeedback] = useState({});

  const cardRef = useRef(null);

  // Flatten all questions for quick lookup
  const allQuestions = useMemo(() => {
    const list = [];
    FAQ_CATEGORIES.forEach((cat) => {
      cat.questions.forEach((q) => {
        list.push({
          ...q,
          categoryId: cat.id,
          categoryName: cat.name,
          categoryShortName: cat.shortName,
          categoryColor: cat.color,
          categoryIcon: cat.icon
        });
      });
    });
    return list;
  }, []);

  // Active Category
  const currentCategory = useMemo(() => {
    return FAQ_CATEGORIES.find((c) => c.id === activeCategoryId) || FAQ_CATEGORIES[0];
  }, [activeCategoryId]);

  // Active Question
  const currentQuestion = useMemo(() => {
    return allQuestions.find((q) => q.id === activeQuestionId) || allQuestions[0];
  }, [allQuestions, activeQuestionId]);

  // Index of active question in current category
  const currentQuestionIdx = useMemo(() => {
    return currentCategory.questions.findIndex((q) => q.id === activeQuestionId);
  }, [currentCategory, activeQuestionId]);

  // Switch Category
  const handleSelectCategory = (catId) => {
    setActiveCategoryId(catId);
    const cat = FAQ_CATEGORIES.find((c) => c.id === catId);
    if (cat && cat.questions.length > 0) {
      setActiveQuestionId(cat.questions[0].id);
    }
  };

  // Switch Question
  const handleSelectQuestion = (questionId, catId) => {
    if (catId && catId !== activeCategoryId) {
      setActiveCategoryId(catId);
    }
    setActiveQuestionId(questionId);
    if (window.innerWidth < 900 && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  // Previous & Next Navigation
  const handleNext = () => {
    if (currentQuestionIdx < currentCategory.questions.length - 1) {
      setActiveQuestionId(currentCategory.questions[currentQuestionIdx + 1].id);
    }
  };

  const handlePrev = () => {
    if (currentQuestionIdx > 0) {
      setActiveQuestionId(currentCategory.questions[currentQuestionIdx - 1].id);
    }
  };

  // Copy Answer
  const handleCopy = () => {
    if (!currentQuestion) return;
    navigator.clipboard.writeText(`${currentQuestion.question}\n\n${currentQuestion.answer}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Text formatting
  const renderText = (content) => {
    return content.split("\n").map((line, idx) => {
      const urlRegex = /(https?:\/\/[^\s]+|[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
      const parts = line.split(urlRegex);
      return (
        <p key={idx} className="faq-text-line">
          {parts.map((part, pIdx) => {
            if (/^https?:\/\//.test(part)) {
              return (
                <a
                  key={pIdx}
                  href={part}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="faq-text-link"
                >
                  {part}
                </a>
              );
            }
            if (/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(part)) {
              return (
                <a key={pIdx} href={`mailto:${part}`} className="faq-text-link">
                  {part}
                </a>
              );
            }
            return part;
          })}
        </p>
      );
    });
  };

  return (
    <div className="faq-flow-page">
      {/* ── Top Header ────────────────────────────────────────── */}
      <header className="faq-header-hero">
        <div className="faq-hero-badge">
          <span className="faq-badge-pulse"></span>
          <span>Help & Knowledge Center</span>
        </div>

        <h1 className="faq-hero-heading">Frequently Asked Questions</h1>
        <p className="faq-hero-desc">
          Select a category below to browse through questions, find setup instructions, and resolve queries.
        </p>

        <div className="faq-hero-policy-bar">
          <Link to="/terms-and-conditions" className="faq-policy-nav-btn">
            <span>📜</span>
            <span>Terms & Conditions</span>
            <span className="faq-policy-arrow">→</span>
          </Link>
          <Link to="/privacy-policy" className="faq-policy-nav-btn">
            <span>🔒</span>
            <span>Privacy Policy</span>
            <span className="faq-policy-arrow">→</span>
          </Link>
          <Link to="/shipping-refund-policy" className="faq-policy-nav-btn">
            <span>📦</span>
            <span>Shipping & Refund</span>
            <span className="faq-policy-arrow">→</span>
          </Link>
        </div>
      </header>

      {/* ── 1. MAIN CATEGORY CARDS (TOP SECTION) ───────────────── */}
      <section className="faq-categories-grid" aria-label="FAQ Categories">
        {FAQ_CATEGORIES.map((cat) => {
          const isActive = cat.id === activeCategoryId;
          return (
            <button
              key={cat.id}
              type="button"
              className={`faq-category-card ${isActive ? "active" : ""}`}
              onClick={() => handleSelectCategory(cat.id)}
              style={{ "--cat-color": cat.color }}
            >
              <div className="faq-cat-top">
                <span className="faq-cat-icon">{cat.icon}</span>
                <span className="faq-cat-count">{cat.questions.length} Questions</span>
              </div>
              <h3 className="faq-cat-title">{cat.shortName}</h3>
              <p className="faq-cat-desc">{cat.tagline}</p>
              <div className="faq-cat-action">
                <span className="faq-cat-link-text">
                  {isActive ? "● Active Category" : "Select Topic &rarr;"}
                </span>
              </div>
            </button>
          );
        })}
      </section>

      {/* ── 2. QUESTIONS SELECTOR (IN ACTIVE CATEGORY) ──────────── */}
      <section className="faq-questions-pill-selector">
        <div className="faq-questions-selector-header">
          <div className="faq-cat-heading-wrap">
            <span className="faq-cat-heading-icon">{currentCategory.icon}</span>
            <div>
              <h2>{currentCategory.name}</h2>
              <span className="faq-cat-subtext">{currentCategory.tagline}</span>
            </div>
          </div>
          <span className="faq-question-counter-badge">
            Question {currentQuestionIdx + 1} of {currentCategory.questions.length}
          </span>
        </div>

        <div className="faq-questions-pill-list">
          {currentCategory.questions.map((q, idx) => {
            const isSelected = q.id === activeQuestionId;
            return (
              <button
                key={q.id}
                type="button"
                className={`faq-question-pill-btn ${isSelected ? "selected" : ""}`}
                onClick={() => handleSelectQuestion(q.id)}
              >
                <span className="faq-pill-index">{idx + 1}</span>
                <span className="faq-pill-title">{q.question}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── 3. RESOLUTION ANSWER CARD ──────────────────────────── */}
      <main className="faq-resolution-stage" ref={cardRef}>
        {currentQuestion && (
          <article className="faq-answer-canvas">
            {/* Top Row Meta */}
            <div className="faq-card-header-meta">
              <div className="faq-card-tag-pill">
                <span
                  className="faq-color-dot"
                  style={{ backgroundColor: currentCategory.color }}
                ></span>
                <span>
                  {currentCategory.shortName} • Question {currentQuestionIdx + 1} of {currentCategory.questions.length}
                </span>
              </div>

              <div className="faq-card-counter-tag">
                {currentQuestionIdx + 1} / {currentCategory.questions.length}
              </div>
            </div>

            {/* Question Heading */}
            <h2 className="faq-card-main-question">{currentQuestion.question}</h2>

            {/* Answer Content */}
            <div className="faq-card-answer-body">
              {renderText(currentQuestion.answer)}
            </div>

            {/* Direct CTA Action Button */}
            {currentQuestion.actionUrl && (
              <div className="faq-cta-btn-wrap">
                {currentQuestion.isInternalLink || currentQuestion.actionUrl.startsWith("/") ? (
                  <Link
                    to={currentQuestion.actionUrl}
                    className="faq-direct-cta"
                    style={{ backgroundColor: currentCategory.color }}
                  >
                    {currentQuestion.actionLabel || "Open Action ➔"}
                  </Link>
                ) : (
                  <a
                    href={currentQuestion.actionUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="faq-direct-cta"
                    style={{ backgroundColor: currentCategory.color }}
                  >
                    {currentQuestion.actionLabel || "Open Action ➔"}
                  </a>
                )}
              </div>
            )}

            {/* Previous & Next Navigation */}
            <div className="faq-card-stepper-nav">
              <button
                type="button"
                className="faq-nav-button"
                onClick={handlePrev}
                disabled={currentQuestionIdx <= 0}
              >
                ← Previous Question
              </button>

              <div className="faq-nav-indicator-dots">
                {currentCategory.questions.map((q, idx) => (
                  <span
                    key={q.id}
                    className={`faq-nav-dot ${idx === currentQuestionIdx ? "active" : ""}`}
                    onClick={() => handleSelectQuestion(q.id)}
                    title={q.question}
                  />
                ))}
              </div>

              <button
                type="button"
                className="faq-nav-button primary"
                onClick={handleNext}
                disabled={currentQuestionIdx >= currentCategory.questions.length - 1}
                style={{
                  backgroundColor:
                    currentQuestionIdx < currentCategory.questions.length - 1
                      ? currentCategory.color
                      : undefined
                }}
              >
                Next Question →
              </button>
            </div>

            {/* Helpful Feedback & WhatsApp Bar */}
            <div className="faq-card-bottom-actions">
              <div className="faq-feedback-group">
                <span className="faq-feedback-prompt">Was this helpful?</span>
                {helpfulFeedback[currentQuestion.id] ? (
                  <span className="faq-feedback-confirmed">
                    ✓ Thank you for your feedback!
                  </span>
                ) : (
                  <div className="faq-feedback-thumbs">
                    <button
                      type="button"
                      className="faq-thumb-action"
                      onClick={() =>
                        setHelpfulFeedback((p) => ({ ...p, [currentQuestion.id]: true }))
                      }
                    >
                      👍 Yes
                    </button>
                    <button
                      type="button"
                      className="faq-thumb-action"
                      onClick={() =>
                        setHelpfulFeedback((p) => ({ ...p, [currentQuestion.id]: true }))
                      }
                    >
                      👎 No
                    </button>
                  </div>
                )}
              </div>

              <div className="faq-action-buttons-group">
                <button type="button" className="faq-copy-action-btn" onClick={handleCopy}>
                  {copied ? "✓ Copied!" : "📋 Copy Details"}
                </button>

                <a
                  href={`https://wa.me/919480865623?text=${encodeURIComponent(
                    `Namaste, I have a query regarding: "${currentQuestion.question}"`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="faq-whatsapp-action-btn"
                >
                  💬 WhatsApp Seva
                </a>
              </div>
            </div>
          </article>
        )}
      </main>

      {/* ── 4. CUSTOMER SUPPORT BANNER (FOOTER) ────────────────── */}
      <footer className="faq-support-footer-banner">
        <div className="faq-support-footer-info">
          <span className="faq-support-footer-kicker">Need Further Assistance?</span>
          <h3>Our Customer Seva Team is Ready to Help</h3>
          <p>
            Whether you need guidance choosing the right Sanskrit course, ordering combo packs, or resolving software questions, reach out to us anytime.
          </p>
        </div>

        <div className="faq-support-footer-channels">
          <a href="tel:+919480865623" className="faq-footer-channel-card">
            <span className="faq-footer-ch-icon">📞</span>
            <div>
              <strong>Call Us</strong>
              <span>+91 9480 865 623</span>
            </div>
          </a>

          <a href="mailto:support@digitalsanskritguru.com" className="faq-footer-channel-card">
            <span className="faq-footer-ch-icon">✉️</span>
            <div>
              <strong>Email Us</strong>
              <span>support@digitalsanskritguru.com</span>
            </div>
          </a>
        </div>
      </footer>
    </div>
  );
}