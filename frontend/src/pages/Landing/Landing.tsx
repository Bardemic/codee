import { Link } from 'react-router-dom';
import styles from './landing.module.css';
import codeeLogo from '../../assets/svgs/CodeeLogo.svg';
import { FiZap, FiGitBranch, FiUsers, FiGrid, FiShield, FiTrendingUp } from 'react-icons/fi';

export default function Landing() {
    return (
        <div className={styles.page}>
            {/* ── Navigation ── */}
            <nav className={styles.nav}>
                <Link to="/landing" className={styles.navBrand}>
                    <img src={codeeLogo} alt="Codee" className={styles.navLogo} />
                    <span className={styles.navName}>codee</span>
                </Link>
                <div className={styles.navLinks}>
                    <a href="#features" className={styles.navLink}>
                        Features
                    </a>
                    <a href="#product" className={styles.navLink}>
                        Product
                    </a>
                    <a href="#how-it-works" className={styles.navLink}>
                        How It Works
                    </a>
                    <Link to="/login" className={styles.navCta}>
                        Get Started
                    </Link>
                </div>
            </nav>

            {/* ── Hero ── */}
            <section className={styles.hero}>
                <span className={styles.heroLabel}>Async AI Coding Agents</span>
                <h1 className={styles.heroTitle}>
                    Ship code faster with <span className={styles.heroAccent}>autonomous agents</span>
                </h1>
                <p className={styles.heroSub}>
                    Codee deploys AI coding agents that work in the background — fixing bugs, building features, and managing pull requests while you
                    focus on what matters.
                </p>
                <div className={styles.heroCtas}>
                    <Link to="/login" className={styles.primaryCta}>
                        Start Building for Free
                    </Link>
                    <a href="#product" className={styles.secondaryCta}>
                        See It in Action
                    </a>
                </div>
            </section>

            {/* ── Hero screenshot ── */}
            <div className={styles.showcase}>
                <div className={styles.screenshotFrame}>
                    <div className={styles.screenshotBar}>
                        <span className={styles.screenshotDot} />
                        <span className={styles.screenshotDot} />
                        <span className={styles.screenshotDot} />
                    </div>
                    <div className={styles.screenshotPlaceholder}>
                        <span className={styles.screenshotPlaceholderIcon}>&#9675;</span>
                        Dashboard — Task creation &amp; workspace overview
                        <span className={styles.screenshotCaption}>1280 &times; 800 &middot; screenshot placeholder</span>
                    </div>
                </div>
            </div>

            {/* ── Features ── */}
            <section className={styles.features} id="features">
                <p className={styles.sectionLabel}>Features</p>
                <h2 className={styles.sectionTitle}>Everything you need to automate your dev workflow</h2>
                <p className={styles.sectionSub}>
                    From issue triage to production-ready PRs, Codee handles the heavy lifting so your team can move faster.
                </p>

                <div className={styles.featureGrid}>
                    <div className={styles.featureCard}>
                        <div className={styles.featureIcon}>
                            <FiZap />
                        </div>
                        <div className={styles.featureTitle}>Async Agents</div>
                        <div className={styles.featureDesc}>
                            Spin up coding agents that run in the background. Describe a task, pick a repo and branch, and let Codee handle the rest.
                        </div>
                    </div>

                    <div className={styles.featureCard}>
                        <div className={styles.featureIcon}>
                            <FiGitBranch />
                        </div>
                        <div className={styles.featureTitle}>Branch-Aware Workflows</div>
                        <div className={styles.featureDesc}>
                            Agents operate on the exact branch you specify. Review diffs, create PRs, and merge — all from one interface.
                        </div>
                    </div>

                    <div className={styles.featureCard}>
                        <div className={styles.featureIcon}>
                            <FiUsers />
                        </div>
                        <div className={styles.featureTitle}>Webhook Workers</div>
                        <div className={styles.featureDesc}>
                            Trigger agents automatically from GitHub events, PostHog alerts, or Slack messages. Build reactive automation pipelines.
                        </div>
                    </div>

                    <div className={styles.featureCard}>
                        <div className={styles.featureIcon}>
                            <FiGrid />
                        </div>
                        <div className={styles.featureTitle}>Integrations</div>
                        <div className={styles.featureDesc}>
                            Connect GitHub, Slack, PostHog, and more. Agents use your tools to read context, post updates, and commit code.
                        </div>
                    </div>

                    <div className={styles.featureCard}>
                        <div className={styles.featureIcon}>
                            <FiShield />
                        </div>
                        <div className={styles.featureTitle}>Team &amp; Org Management</div>
                        <div className={styles.featureDesc}>
                            Invite teammates, manage roles, and track usage across your organization with built-in billing and seat management.
                        </div>
                    </div>

                    <div className={styles.featureCard}>
                        <div className={styles.featureIcon}>
                            <FiTrendingUp />
                        </div>
                        <div className={styles.featureTitle}>Usage Analytics</div>
                        <div className={styles.featureDesc}>
                            Monitor token consumption, cost breakdowns, and agent activity in real time. Stay in control of your spend.
                        </div>
                    </div>
                </div>
            </section>

            {/* ── Product screenshots ── */}
            <section className={styles.screenshots} id="product">
                <div className={styles.screenshotsInner}>
                    <p className={styles.sectionLabel}>Product</p>
                    <h2 className={styles.sectionTitle}>Built for the way engineering teams work</h2>
                    <p className={styles.sectionSub}>See how Codee fits into your day-to-day development workflow.</p>

                    <div className={styles.screenshotGrid}>
                        <div className={styles.screenshotCard}>
                            <div className={styles.screenshotCardImage}>
                                <span className={styles.screenshotCardIcon}>&#9675;</span>
                                860 &times; 520 &middot; screenshot placeholder
                            </div>
                            <div className={styles.screenshotCardBody}>
                                <div className={styles.screenshotCardTitle}>Workspace Conversations</div>
                                <div className={styles.screenshotCardDesc}>
                                    Chat with your agent in real time. Watch tool calls execute, review diffs inline, and steer the work as it happens.
                                </div>
                            </div>
                        </div>

                        <div className={styles.screenshotCard}>
                            <div className={styles.screenshotCardImage}>
                                <span className={styles.screenshotCardIcon}>&#9675;</span>
                                860 &times; 520 &middot; screenshot placeholder
                            </div>
                            <div className={styles.screenshotCardBody}>
                                <div className={styles.screenshotCardTitle}>Worker Automation</div>
                                <div className={styles.screenshotCardDesc}>
                                    Configure workers that respond to webhooks automatically — triage issues, fix regressions, or post Slack summaries.
                                </div>
                            </div>
                        </div>

                        <div className={styles.screenshotCard}>
                            <div className={styles.screenshotCardImage}>
                                <span className={styles.screenshotCardIcon}>&#9675;</span>
                                860 &times; 520 &middot; screenshot placeholder
                            </div>
                            <div className={styles.screenshotCardBody}>
                                <div className={styles.screenshotCardTitle}>Integration Hub</div>
                                <div className={styles.screenshotCardDesc}>
                                    Connect your tools in one click. GitHub repos, Slack channels, and PostHog projects — all wired up and ready to go.
                                </div>
                            </div>
                        </div>

                        <div className={styles.screenshotCard}>
                            <div className={styles.screenshotCardImage}>
                                <span className={styles.screenshotCardIcon}>&#9675;</span>
                                860 &times; 520 &middot; screenshot placeholder
                            </div>
                            <div className={styles.screenshotCardBody}>
                                <div className={styles.screenshotCardTitle}>Usage Dashboard</div>
                                <div className={styles.screenshotCardDesc}>
                                    Track token usage, cost per agent, and billing cycles. Understand exactly where your compute budget goes.
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* ── How it works ── */}
            <section className={styles.howItWorks} id="how-it-works">
                <p className={styles.sectionLabel}>How It Works</p>
                <h2 className={styles.sectionTitle}>Three steps to autonomous code</h2>
                <p className={styles.sectionSub}>Get from idea to pull request without context-switching.</p>

                <div className={styles.stepsGrid}>
                    <div className={styles.step}>
                        <div className={styles.stepNumber}>1</div>
                        <div className={styles.stepTitle}>Describe Your Task</div>
                        <div className={styles.stepDesc}>
                            Pick a repo and branch, write a prompt describing the work, and select which integrations the agent can use.
                        </div>
                    </div>

                    <div className={styles.step}>
                        <div className={styles.stepNumber}>2</div>
                        <div className={styles.stepTitle}>Agent Gets to Work</div>
                        <div className={styles.stepDesc}>
                            Codee spins up an async agent that reads your codebase, makes changes, runs tools, and streams progress back to you.
                        </div>
                    </div>

                    <div className={styles.step}>
                        <div className={styles.stepNumber}>3</div>
                        <div className={styles.stepTitle}>Review &amp; Ship</div>
                        <div className={styles.stepDesc}>
                            Review the agent's work in-app, create a branch or PR directly, and merge with confidence. Done.
                        </div>
                    </div>
                </div>
            </section>

            {/* ── Bottom CTA ── */}
            <section className={styles.ctaBanner}>
                <h2 className={styles.ctaTitle}>Ready to put your backlog on autopilot?</h2>
                <p className={styles.ctaSub}>Join teams already shipping faster with Codee. Set up in under two minutes — no credit card required.</p>
                <Link to="/login" className={styles.primaryCta}>
                    Get Started for Free
                </Link>
            </section>

            {/* ── Footer ── */}
            <footer className={styles.footer}>
                <div className={styles.footerBrand}>
                    <img src={codeeLogo} alt="Codee" className={styles.footerLogo} />
                    <span className={styles.footerName}>codee</span>
                </div>
                <span className={styles.footerCopy}>&copy; {new Date().getFullYear()} Codee. All rights reserved.</span>
                <div className={styles.footerLinks}>
                    <a href="#features" className={styles.footerLink}>
                        Features
                    </a>
                    <a href="#product" className={styles.footerLink}>
                        Product
                    </a>
                    <a href="#how-it-works" className={styles.footerLink}>
                        How It Works
                    </a>
                </div>
            </footer>
        </div>
    );
}
