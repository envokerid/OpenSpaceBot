import type { Metadata } from "next";
import Link from "next/link";
import { Arrow } from "../icons";

export const metadata: Metadata = {
  title: "Solutions — openWorkOS",
  description: "Put openWorkBot to work on research, coding, and everyday tasks. Bring your AI agents, connected apps, and conversations together.",
};

export default function SolutionsPage() {
  return (
    <main id="main">
      <section className="content-section solutions-section" id="solutions" aria-labelledby="solutions-title">
        <div className="section-intro">
          <p className="section-label">Solutions</p>
          <h1 id="solutions-title">Give your AI team<br />work worth doing.</h1>
          <p className="section-description">
            Start with a goal. openWorkBot brings your agents, connected apps,
            and conversations together to help you move it forward.
          </p>
        </div>
        <div className="solutions-grid">
          <article className="solution-item">
            <span className="solution-number" aria-hidden="true">01</span>
            <h2>Turn research into a plan.</h2>
            <p>
              Ask an agent to explore a topic, compare options, or turn scattered
              information into a useful brief. Keep your questions, findings,
              and next steps in the same conversation.
            </p>
          </article>
          <article className="solution-item">
            <span className="solution-number" aria-hidden="true">02</span>
            <h2>Build with a team beside you.</h2>
            <p>
              Bring coding agents into your workflow to investigate issues,
              draft changes, and work through implementation. Follow their
              progress and guide the next step from chat.
            </p>
          </article>
          <article className="solution-item">
            <span className="solution-number" aria-hidden="true">03</span>
            <h2>Make everyday work lighter.</h2>
            <p>
              Connect your tools and delegate tasks like organizing information,
              preparing updates, and drafting follow-ups. Review requests that
              need your approval as the work moves forward.
            </p>
          </article>
        </div>
        <Link className="section-link" href="/#about">About openWorkBot <Arrow /></Link>
      </section>
    </main>
  );
}
