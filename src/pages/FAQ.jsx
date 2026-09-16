import { useState } from "react";
import "./FAQ.css";

function FAQ() {
  const [activeCategory, setActiveCategory] = useState("all");
  const [expandedItems, setExpandedItems] = useState({});

  const toggleItem = (id) => {
    setExpandedItems((prev) => (prev[id] ? {} : { [id]: true }));
  };

  const faqData = {
    general: {
      title: "General Questions",
      items: [
        {
          id: "g1",
          question: "What does digitalsanskritguru stand for?",
          answer: "Vyoma offers digital Sanskrit learning for interested learners at all levels. This learning is in the form of Courses, Self-learning tools (interchangeably called products here) and books. Digital Sanskrit Guru is a one stop place to get to know about the products created by the Vyoma team."
        },
        {
          id: "g2",
          question: "What is the name of the company which has created these tools and products?",
          answer: "All these products, courses, and educational tools are developed by Vyoma Linguistic Labs Foundation, a non-profit organization dedicated to making Sanskrit learning accessible globally."
        },
        {
          id: "g3",
          question: "Where is Vyoma located?",
          answer: "Our registered office is located at: No 84, 3rd cross, N G E F Layout, 2nd Block, Opp Fortis Hospital, Nagarabhavi, Bengaluru, Karnataka 560072."
        },
        {
          id: "g4",
          question: "How do we know more about the organisation?",
          answer: "You can read about our mission, vision, and operational history directly on our corporate page: https://vyoma.org/about/"
        },
        {
          id: "g5",
          question: "Who are the people behind these products?",
          answer: "Our core team consists of Sanskrit scholars, educators, software engineers, and passionate volunteers. You can meet our leadership and advisors at: https://vyoma.org/about/"
        },
        {
          id: "g6",
          question: "Do you have a company brochure?",
          answer: "Yes, our brochure outlining our educational initiatives, tools, and mission impact can be accessed at: https://digitalsanskritguru.com/wp-content/uploads/2020/08/Vyoma-Sanskrit-Movement-2020-DSG-website.pdf"
        },
        {
          id: "g7",
          question: "Where do I access the courses that Vyoma Labs have?",
          answer: "You can register for and participate in our online courses at our dedicated portal: https://www.sanskritfromhome.org"
        },
        {
          id: "g8",
          question: "How to Place an Order for the Product?",
          answer: "We have compiled a step-by-step PDF guide outlining the ordering process. You can download and read it here: https://digitalsanskritguru.com/wp-content/uploads/2020/10/Procedure_for_downloadable_link.pdf"
        }
      ]
    },
    product: {
      title: "Product / Learning",
      items: [
        {
          id: "p1",
          question: "What is the path for Sanskrit Learning?",
          answer: "For a personalized roadmap or recommendations tailored to your goals, please write to our guidance support email: support@digitalsanskritguru.com"
        },
        {
          id: "p2",
          question: "What is the qualification I should have before I can use these products?",
          answer: "No prior qualifications are needed! We offer entry-level products designed for absolute beginners, as well as intermediate and advanced resources for experienced learners."
        },
        {
          id: "p3",
          question: "Can I speak fluently in Sanskrit after I study this?",
          answer: "Yes, we have structured language and spoken-Sanskrit products that introduce conversations, sentences, and vocabulary to build vocabulary and speaking confidence."
        },
        {
          id: "p4",
          question: "Will I be able to understand scriptures/Upanishads after I study this?",
          answer: "We have combo packs that initiate you in this process. Once you feel comfortable, write us an email and we can suggest specific advanced courses that will make you competent to read and understand the scriptures."
        },
        {
          id: "p5",
          question: "Which combos are available?",
          answer: "We offer several curriculum combos including:\n1. Stress relief and peace of mind with Sanskrit.\n2. Concentration and memory enhancement.\n3. Basic Sanskrit Shlokas learning.\n4. Step-by-step basic Sanskrit structure.\n5. Sanskrit Grammar fundamentals.\n6. Sanskrit Language + Grammar combo pack."
        },
        {
          id: "p6",
          question: "Which languages are these products available in?",
          answer: "The study materials and explanations are available in English, Sanskrit, and various regional Indian languages depending on the specific product module."
        },
        {
          id: "p7",
          question: "How do I access and use these products? What are the different modes available?",
          answer: "We support multiple learning formats:\n• Downloadable Version: Download once to your Windows system and run offline without the internet.\n• Web Version: Access through any web browser on any OS with internet connectivity.\n• USB Drive: Locked USB stick containing pre-loaded materials sent to your address (India & US only).\n• Paperback Books: Traditional printed textbooks (available in India only).\n• Flipbooks: Interactive digital flipping books readable on our web portal."
        },
        {
          id: "p8",
          question: "Do you give Certificates once we finish learning with these products?",
          answer: "Yes, we support learning assessments. For evaluation requests and certification details, write to support@digitalsanskritguru.com."
        },
        {
          id: "p9",
          question: "Where can I have a look at the demo of the products?",
          answer: "For booking a interactive presentation or request a demo setup, write to support@digitalsanskritguru.com."
        }
      ]
    },
    payments: {
      title: "Payments",
      items: [
        {
          id: "pay1",
          question: "How do I buy these products?",
          answer: "You can purchase products directly through our online store catalog at: https://digitalsanskritguru.com"
        },
        {
          id: "pay2",
          question: "What forms of payment do you accept?",
          answer: "We accept credit/debit cards, UPI, net banking, direct NEFT/RTGS bank transfers, and Cheques/DDs drawn in favor of 'Vyoma Linguistic Labs Foundation'."
        },
        {
          id: "pay3",
          question: "I do not have a credit card. How do I buy your products?",
          answer: "You can pay via UPI, Net Banking, Direct Bank Transfer (NEFT/IMPS), or mail us a cheque/DD."
        },
        {
          id: "pay4",
          question: "Do you have any outlet for your products? Where is it available?",
          answer: "Yes, you can visit us at: Vyoma Linguistic Labs Foundation, No 84, 3rd cross, N G E F Layout, 2nd Block, Opp Fortis Hospital, Nagarabhavi, Bengaluru, Karnataka 560072."
        },
        {
          id: "pay5",
          question: "Is your product available outside India? If so where?",
          answer: "All digital formats (Web Version, Downloadable Version, Flipbooks) are available for instant purchase and delivery worldwide."
        },
        {
          id: "pay6",
          question: "How do people outside India buy your product?",
          answer: "International customers can pay via credit cards or perform direct wire transfers. For wire transfer details, please email us at support@digitalsanskritguru.com."
        }
      ]
    },
    technical: {
      title: "Technical Support",
      items: [
        {
          id: "t1",
          question: "I have a MAC system. Will all your products work on MAC?",
          answer: "Web-version products and flipbooks run on any browser on macOS. You can browse our dedicated macOS compatible catalog filter here: https://digitalsanskritguru.com/shop/?filter_cat_1=25"
        },
        {
          id: "t2",
          question: "I do not have a computer at home. Can I use your product?",
          answer: "Yes, our Web Version, courses, and flipbooks can be accessed on smartphones and tablets."
        },
        {
          id: "t3",
          question: "Do I need internet connection to access your products?",
          answer: "Internet is only required for Web Versions, Flipbooks, and initial downloads. The Downloadable version and USB formats do not require internet access after initial setup."
        },
        {
          id: "t4",
          question: "Can I copy the USB / CD into another system?",
          answer: "No, the USB content is copy-protected and locked to run directly from the physical drive for licensing security."
        },
        {
          id: "t5",
          question: "If there are any problems with the product or USB, what should we do?",
          answer: "Write to support@digitalsanskritguru.com. If your hardware is defective, our Seva team will ship a replacement or grant you web version access."
        },
        {
          id: "t6",
          question: "Do you have a catalog?",
          answer: "Yes, you can access our comprehensive product catalog here: https://digitalsanskritguru.com/product-catalog/"
        },
        {
          id: "t7",
          question: "How to download and extract the downloadable link after purchase?",
          answer: "We have created a guide to help you extract files: https://digitalsanskritguru.com/wp-content/uploads/2020/09/Steps-to-Extract-method-downloadable-version.pdf"
        }
      ]
    }
  };

  const categories = [
    { id: "all", label: "All Questions" },
    { id: "general", label: "General" },
    { id: "product", label: "Product & Learning" },
    { id: "payments", label: "Payments" },
    { id: "technical", label: "Technical" }
  ];

  return (
    <div className="faq-page">
      <header className="faq-header">
        <span className="faq-kicker">Help Center</span>
        <h1>Frequently Asked Questions</h1>
        <p className="faq-subtitle">Find answers to questions about Sanskrit products, learning methods, and payments</p>
      </header>

      <div className="faq-categories">
        {categories.map((cat) => (
          <button
            key={cat.id}
            type="button"
            className={`faq-category-btn${activeCategory === cat.id ? " active" : ""}`}
            onClick={() => setActiveCategory(cat.id)}
          >
            {cat.label}
          </button>
        ))}
      </div>

      <div className="faq-sections-list">
        {Object.entries(faqData).map(([key, category]) => {
          if (activeCategory !== "all" && activeCategory !== key) return null;

          return (
            <section key={key} className="faq-section">
              <h2>{category.title}</h2>
              <div className="faq-list">
                {category.items.map((item) => {
                  const isExpanded = !!expandedItems[item.id];
                  return (
                    <article
                      key={item.id}
                      className={`faq-item${isExpanded ? " expanded" : ""}`}
                    >
                      <button
                        type="button"
                        className="faq-question-btn"
                        onClick={() => toggleItem(item.id)}
                        aria-expanded={isExpanded}
                      >
                        <span>{item.question}</span>
                        <span className="faq-toggle-icon">+</span>
                      </button>
                      <div className="faq-answer" style={{ maxHeight: isExpanded ? "500px" : "0px" }}>
                        <div className="faq-answer-content">
                          {item.answer.split("\n").map((line, idx) => {
                            const urlOrEmailRegex = /(https?:\/\/[^\s]+|[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
                            const parts = line.split(urlOrEmailRegex);
                            return (
                              <p key={idx}>
                                {parts.map((part, pIdx) => {
                                  if (/^https?:\/\//.test(part)) {
                                    return (
                                      <a
                                        key={pIdx}
                                        href={part}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{ color: "var(--site-link, #2563eb)", textDecoration: "underline", wordBreak: "break-word" }}
                                      >
                                        {part}
                                      </a>
                                    );
                                  }
                                  if (/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(part)) {
                                    return (
                                      <a
                                        key={pIdx}
                                        href={`mailto:${part}`}
                                        style={{ color: "var(--site-link, #2563eb)", textDecoration: "underline" }}
                                      >
                                        {part}
                                      </a>
                                    );
                                  }
                                  return part;
                                })}
                              </p>
                            );
                          })}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      <div className="faq-contact-box">
        <h3>Still have questions?</h3>
        <p>Our Customer Seva team is here to assist you with your Sanskrit learning journey.</p>
        <div className="faq-contact-links">
          <span className="faq-contact-item">
            📞 <strong>Call Us:</strong> +91 9480 865 623
          </span>
          <span className="faq-contact-item">
            ✉️ <strong>Email Us:</strong> <a href="mailto:support@digitalsanskritguru.com">support@digitalsanskritguru.com</a>
          </span>
        </div>
      </div>
    </div>
  );
}

export default FAQ;