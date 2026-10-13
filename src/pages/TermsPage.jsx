import React from 'react';
import { motion } from 'framer-motion';
import { ShieldCheck, AlertTriangle, Scale, Ban, Info } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Footer from '../components/Footer';

const sections = [
  {
    icon: <AlertTriangle size={22} className="text-yellow-400" />,
    color: 'bg-yellow-500/10 border-yellow-500/30',
    title: 'Fan-Made Simulation & Non-Affiliation Disclaimer',
    content: `IPL Auction Simulator (cricketauction3.vercel.app) is a free, non-commercial fan simulation game created purely for entertainment and strategy practice. We are not affiliated with, endorsed by, or associated with the Board of Control for Cricket in India (BCCI), the Indian Premier League (IPL), or any official franchise team. All team names, logos, and trademarks belong to their respective owners.`,
    highlight: true,
  },
  {
    icon: <Info size={22} className="text-blue-400" />,
    color: 'bg-blue-500/10 border-blue-500/30',
    number: '01',
    title: 'Acceptance of Terms',
    content: `By accessing or playing IPL Auction Simulator, you agree to comply with and be bound by these Terms and Conditions. If you do not agree to these terms, please do not use the service.`,
  },
  {
    icon: <Scale size={22} className="text-blue-400" />,
    color: 'bg-blue-500/10 border-blue-500/30',
    number: '02',
    title: 'Virtual Purse & No Real Money Policy',
    content: `All monetary values, team purse budgets (e.g., ₹120 Crore), player valuations, and bid increments represent strictly virtual points. No real money is deposited, earned, wagered, or paid out under any circumstances.`,
  },
  {
    icon: <Ban size={22} className="text-blue-400" />,
    color: 'bg-blue-500/10 border-blue-500/30',
    number: '03',
    title: 'Fair Play & User Conduct',
    content: `To keep the platform competitive and fun for all players, users agree not to:`,
    bullets: [
      'Use automated scripts, bots, or browser hacks to bypass bidding countdown timers.',
      'Enter offensive, abusive, or hate speech into custom room names or manager handles.',
      'Attempt to overload, DDOS, or reverse-engineer real-time backend database endpoints.',
      'Impersonate administrators, organizers, or other players.',
    ],
  },
  {
    icon: <ShieldCheck size={22} className="text-blue-400" />,
    color: 'bg-blue-500/10 border-blue-500/30',
    number: '04',
    title: 'Intellectual Property',
    content: `All IPL team names, logos, player names, and related trademarks are the property of their respective owners (BCCI/IPL). This simulator uses them purely for fan-made non-commercial entertainment. Player statistics used in this simulator are publicly available cricket records used for simulation purposes only.`,
  },
  {
    icon: <Info size={22} className="text-blue-400" />,
    color: 'bg-blue-500/10 border-blue-500/30',
    number: '05',
    title: 'Privacy & Data',
    content: `This application uses Firebase Anonymous Authentication — no personal information is required to play. Room data is stored temporarily in Firebase Realtime Database and Firestore. We do not sell, share, or monetize any user data. Session data may be cleared after inactivity.`,
  },
  {
    icon: <Scale size={22} className="text-blue-400" />,
    color: 'bg-blue-500/10 border-blue-500/30',
    number: '06',
    title: 'Limitation of Liability',
    content: `This service is provided "as is" without warranty of any kind. The developers are not liable for any loss of data, interrupted sessions, or technical issues. Auction rooms may expire or become unavailable. Always keep a note of important results as sessions are not permanently guaranteed.`,
  },
  {
    icon: <Info size={22} className="text-blue-400" />,
    color: 'bg-blue-500/10 border-blue-500/30',
    number: '07',
    title: 'Changes to Terms',
    content: `We reserve the right to update these Terms at any time. Continued use of the application after any changes constitutes acceptance of the new terms. Check this page periodically for updates.`,
  },
];

export default function TermsPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#050505] text-white font-sans">
      <div className="max-w-2xl mx-auto px-4 py-16">
        {/* Back button */}
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-[9px] font-black text-gray-500 hover:text-white uppercase tracking-widest transition-colors mb-12"
        >
          ← Back
        </button>

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-12 text-center"
        >
          <h1 className="text-4xl sm:text-5xl font-black uppercase tracking-tight mb-4">
            Terms &amp; Conditions
          </h1>
          <p className="text-sm text-gray-500 leading-relaxed">
            Please review the rules of conduct, virtual purse guidelines, and fan-made IP disclaimers before hosting live IPL Mega Auctions on our platform.
          </p>
        </motion.div>

        {/* Sections */}
        <div className="space-y-4">
          {sections.map((section, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className={`border rounded-2xl p-5 ${section.color}`}
            >
              <div className="flex items-start gap-3 mb-3">
                {section.number && (
                  <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center shrink-0">
                    <span className="text-[9px] font-black text-white">{section.number}</span>
                  </div>
                )}
                {!section.number && <div className="shrink-0 mt-0.5">{section.icon}</div>}
                <h2 className={`font-black uppercase tracking-tight ${section.highlight ? 'text-yellow-400 text-base' : 'text-white text-base'}`}>
                  {section.title}
                </h2>
              </div>
              {section.content && (
                <p className="text-sm text-gray-300 leading-relaxed">{section.content}</p>
              )}
              {section.bullets && (
                <ul className="mt-3 space-y-2">
                  {section.bullets.map((b, bi) => (
                    <li key={bi} className="flex items-start gap-2 text-sm text-gray-300">
                      <span className="text-blue-400 mt-1 shrink-0">•</span>
                      {b}
                    </li>
                  ))}
                </ul>
              )}
            </motion.div>
          ))}
        </div>

        {/* Last updated */}
        <p className="text-center text-[9px] text-gray-700 font-bold uppercase tracking-widest mt-12">
          Last updated: October 2026 · IPL Auction Hub
        </p>
      </div>
      <Footer />
    </div>
  );
}
