import React from "react";
import { Link } from "react-router-dom";
import { BookOpen, Cpu, Award, Users } from "lucide-react";
import "./About.css";

function About() {
  return (
    <div className="about-page">
      {/* Hero Section */}
      <section className="about-hero">
        <div className="about-hero-content">
          <h1>About Us</h1>
          <p className="about-hero-subtitle">
            Bridging Ancient Wisdom and Modern Technology to Spread Sanskrit Consciousness Globally.
          </p>
        </div>
      </section>

      {/* Main Content */}
      <div className="about-container">
        {/* Our Story */}
        <section className="about-section story-section">
          <div className="about-card">
            <h2>Our Journey</h2>
            <p>
              Digital Sanskrit Guru is part of the initiative driven by <strong>Vyoma Linguistic Labs Foundation</strong>, 
              a multidisciplinary non-profit organization dedicated to preservation, learning, and promotion of Sanskrit.
            </p>
            <p>
              Our journey began in 2010 when our founders noticed the challenges many face while trying to master Sanskrit grammar 
              and scriptures. While the desire to learn was immense, the availability of specialized scholars was limited, especially for those 
              balancing learning with modern careers. The realization that <strong>technology is the bridge</strong> led to the birth of 
              our dedicated linguistic practice.
            </p>
          </div>
        </section>

        {/* Features / Pillars */}
        <section className="about-pillars">
          <div className="pillar-card">
            <div className="pillar-icon-wrap">
              <Cpu size={28} className="pillar-icon" />
            </div>
            <h3>Smart Tech Integration</h3>
            <p>
              We design interactive e-learning modules, digital reference materials, and applications 
              to make Sanskrit learning intuitive and accessible from anywhere.
            </p>
          </div>

          <div className="pillar-card">
            <div className="pillar-icon-wrap">
              <BookOpen size={28} className="pillar-icon" />
            </div>
            <h3>Authentic Scholarship</h3>
            <p>
              Every course and product is created in close collaboration with Sanskrit scholars, 
              preserving the traditional roots of the language.
            </p>
          </div>

          <div className="pillar-card">
            <div className="pillar-icon-wrap">
              <Users size={28} className="pillar-icon" />
            </div>
            <h3>Symphony of Minds</h3>
            <p>
              Our unique strength is the close collaboration between technology experts and 
              passionate Sanskrit scholars working towards a shared vision.
            </p>
          </div>
        </section>

        {/* Vision & Mission */}
        <section className="about-section vision-mission-grid">
          <div className="about-card vision-card">
            <h2>Our Core Mission</h2>
            <p>
              To create active Sanskrit consciousness and help over <strong>1 million learners</strong> study, 
              practice, and appreciate the language. We aim to bring fulfillment, focus, and cultural value 
              to people's lives through the practice of Sanskrit.
            </p>
          </div>
          <div className="about-card mission-card">
            <h2>Founding Inspiration</h2>
            <p>
              Our work is guided and inspired by the lifelong dedication of Smt. Ananthalakshmi Natarajan 
              to Saṃskṛta and Saṃskṛti, alongside pioneering perspectives on language rejuvenation and active 
              preservation. Under the mentorship of Shri B. Krishnamurthy, we strive to use the best of technology 
              to share the treasures of Sanskrit with the world.
            </p>
          </div>
        </section>

        {/* CTA Section */}
        <section className="about-cta">
          <h2>Join Our Sanskrit Learning Community</h2>
          <p>
            Explore our collection of learning kits, grammar books, and digital courses designed 
            for students, scholars, and language enthusiasts.
          </p>
          <Link to="/collection" className="about-cta-btn">
            Explore Collection
          </Link>
        </section>
      </div>
    </div>
  );
}

export default About;
