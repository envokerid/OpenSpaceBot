import Image from "next/image";
import { ProductButton } from "./site-shell";
import CopySystemPrompt from "./copy-system-prompt";
import { teammates } from "./teammate-prompts";
import { BrandMark } from "./icons";

export default function Home() {
  return (
    <main id="main">
      <section className="hero" id="home" aria-labelledby="hero-title">
        <div className="hero-glow" aria-hidden="true" />
        <div className="hero-content">
          <div className="hero-copy"><div className="category-label"><span />Introducing openWorkBot by openWorkOS</div><h1 id="hero-title">Your AI team.<br className="desktop-break" /> Ready to work.<br className="desktop-break" /> On your terms.</h1><p className="hero-description">Meet openWorkBot, the first product from openWorkOS. Bring your AI agents together in one chat to plan, build, and get work done. You stay in control.</p></div>
          <div className="hero-actions"><ProductButton /><div className="feature-note" id="features"><p>Local-first AI teamwork, with you in control.</p></div></div>
        </div>
        <div className="hero-team" aria-label="Meet the openWorkBot avatars">
          <div className="team-orbit" aria-hidden="true" />
          <Image className="hero-bot hero-bot-blue" src="/product/avatar-blue.webp" width={512} height={512} alt="Blue openWorkBot avatar" unoptimized preload />
          <Image className="hero-bot hero-bot-purple" src="/product/avatar-purple.webp" width={512} height={512} alt="Purple openWorkBot avatar" unoptimized preload />
          <Image className="hero-bot hero-bot-white" src="/product/avatar-white.webp" width={512} height={512} alt="White openWorkBot avatar with a soft glow and expressive eyes" unoptimized preload />
          <div className="team-caption"><span aria-hidden="true">✦</span> A little personality. A lot of possibility.</div>
        </div>
      </section>

      <section className="content-section product-section" id="product" aria-labelledby="product-title">
        <div className="product-intro">
          <div className="section-intro">
            <p className="section-label">Meet your workspace</p>
            <h2 id="product-title">Big ideas at your desk.<br />Your team in your pocket.</h2>
          </div>
          <p className="section-description">Start with a conversation. Give each bot a role, turn ideas into a plan, and keep your team close on desktop and mobile.</p>
        </div>
        <div className="product-gallery">
          <article className="product-panel desktop-panel">
            <div className="panel-copy"><span className="platform-label">01 / Desktop</span><h3>Room to do your best work.</h3><p>Your agents, conversations, and next steps. Together in one workspace.</p></div>
            <a className="desktop-frame screenshot-link" href="/product/desktop.webp" target="_blank" rel="noreferrer" aria-label="Open the full desktop app screenshot">
              <Image src="/product/desktop.webp" width={994} height={740} alt="openWorkBot desktop app with five AI teammates and Nova outlining a launch plan" unoptimized />
            </a>
            <a className="capture-link" href="/product/desktop.webp" target="_blank" rel="noreferrer">Explore the desktop view <span aria-hidden="true">↗</span></a>
          </article>
          <article className="product-panel mobile-panel">
            <div className="panel-copy"><span className="platform-label">02 / Mobile</span><h3>Good company. Anywhere.</h3><p>Keep your teammates within reach, wherever the day takes you.</p></div>
            <a className="phone-frame screenshot-link" href="/product/mobile.webp" target="_blank" rel="noreferrer" aria-label="Open the full mobile app screenshot">
              <div className="phone-top" aria-hidden="true"><span /> <span /></div>
              <Image src="/product/mobile.webp" width={390} height={780} alt="openWorkBot mobile roster showing Nova, Atlas, Sage, and Piper with their roles and colored avatars" unoptimized />
              <div className="phone-bottom" aria-hidden="true"><span /></div>
            </a>
            <a className="capture-link" href="/product/mobile.webp" target="_blank" rel="noreferrer">Explore the mobile view <span aria-hidden="true">↗</span></a>
          </article>
        </div>
        <p className="capture-note">A look inside openWorkBot, shown with an example team.</p>
      </section>

      <section className="content-section teammates-section" aria-labelledby="teammates-title">
        <div className="section-intro"><p className="section-label">Make the team your own</p><h2 id="teammates-title">Different roles.<br />One shared ambition.</h2><p className="section-description">Give every bot a name, a look, and a purpose. To get started with one of these roles, copy its prompt into your bot’s system instructions and make it your own.</p></div>
        <div className="teammate-grid">
          {teammates.map((bot) => <figure className={`teammate teammate-${bot.color}`} key={bot.name}>
            <Image src={`/product/avatar-${bot.color}.webp`} width={512} height={512} alt={`${bot.name}, a ${bot.color} openWorkBot avatar`} unoptimized />
            <figcaption><div className="teammate-name"><strong>{bot.name}</strong><CopySystemPrompt name={bot.name} prompt={bot.prompt} /></div><span>{bot.role}</span></figcaption>
          </figure>)}
        </div>
      </section>

      <section className="content-section about-section" id="about" aria-labelledby="about-title">
        <div className="section-intro">
          <p className="section-label">About openWorkBot</p>
          <h2 id="about-title">A team you can talk to.<br />A workspace you control.</h2>
          <div className="about-team-graphic" aria-hidden="true">
            <svg className="about-team-connections" viewBox="0 0 440 190" fill="none">
              <path d="M70 66v26q0 24 24 24h102M220 66v50M370 66v26q0 24-24 24H244" />
              <circle cx="70" cy="91" r="3" />
              <circle cx="370" cy="91" r="3" />
            </svg>
            {(["blue", "white", "purple"] as const).map((color) => (
              <Image className={`about-team-avatar about-team-avatar-${color}`} key={color} src={`/product/avatar-${color}.webp`} width={512} height={512} alt="" unoptimized />
            ))}
            <div className="about-workspace"><BrandMark /><span>Your workspace</span></div>
          </div>
        </div>
        <div className="about-copy">
          <p>
            openWorkOS starts with a simple idea: working with AI should feel
            as natural as working with a team. openWorkBot is our first product,
            a local-first chat workspace where you can bring your AI agents
            together and give them work to do.
          </p>
          <p>
            Choose your agents and models, connect your tools, and give each
            bot a role. Talk to them like teammates, follow their progress,
            and step in when they need your direction. Your goals set the
            agenda. You decide what happens next.
          </p>
        </div>
      </section>
    </main>
  );
}
