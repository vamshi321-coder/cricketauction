import React from 'react';
import { motion } from 'framer-motion';
import { ArrowUpRight, ShieldCheck, Mail, Cpu, Award } from 'lucide-react';

const Footer = () => {
  const currentYear = new Date().getFullYear();

  const socialLinks = [
    { icon: <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path></svg>, href: "https://github.com/vamshi321-coder/crickauction", label: "GitHub" }
  ];

  const techStack = [
    { name: "React & Vite", href: "https://vite.dev" },
    { name: "Tailwind CSS", href: "https://tailwindcss.com" },
    { name: "Firebase Firestore", href: "https://firebase.google.com" },
    { name: "Framer Motion", href: "https://motion.dev" }
  ];

  return (
    <footer className="mt-32 w-full max-w-6xl mx-auto px-6 border-t border-white/5 pt-16 pb-12 z-10 relative">
      {/* Background glow effects inside footer area */}
      <div className="absolute top-0 left-1/4 -translate-y-1/2 w-72 h-72 bg-orange-600/5 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute top-0 right-1/4 -translate-y-1/2 w-72 h-72 bg-blue-600/5 blur-[120px] rounded-full pointer-events-none" />

      <div className="grid grid-cols-1 sm:grid-cols-12 gap-10 md:gap-8 pb-12">
        {/* Brand / Intro */}
        <div className="col-span-1 sm:col-span-12 md:col-span-6 space-y-4">
          <div className="flex items-center gap-2">
       
            <span className="text-sm font-black tracking-[0.2em] uppercase text-white bg-clip-text">
              IPL Auction Hub
            </span>
          </div>
          <p className="text-xs text-gray-500 leading-relaxed font-medium pr-4">
            The ultimate real-time multiplayer IPL auction simulator. Build your dream franchise squad, manage team budget and overseas slots, and compete dynamically in live bidding wars.
          </p>
          {/* Social Icons */}
          <div className="flex gap-3 pt-2">
            {socialLinks.map((social) => (
              <motion.a
                key={social.label}
                href={social.href}
                target="_blank"
                rel="noopener noreferrer"
                whileHover={{ y: -3, scale: 1.05, backgroundColor: "rgba(255, 255, 255, 0.08)", borderColor: "rgba(255, 255, 255, 0.2)" }}
                whileTap={{ scale: 0.95 }}
                className="w-10 h-10 rounded-xl bg-white/[0.03] border border-white/5 flex items-center justify-center text-gray-500 hover:text-white transition-all duration-300"
                title={social.label}
              >
                {social.icon}
              </motion.a>
            ))}
          </div>
        </div>

        {/* Tech Stack */}
        <div className="col-span-1 sm:col-span-6 md:col-span-3 space-y-4">
          <h4 className="text-[10px] font-black text-gray-600 uppercase tracking-[0.3em]">Built With</h4>
          <ul className="space-y-2">
            {techStack.map((tech) => (
              <li key={tech.name}>
                <a
                  href={tech.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-gray-500 hover:text-white font-bold uppercase tracking-wider transition-colors duration-200 flex items-center gap-1 group"
                >
                  {tech.name}
                  <Cpu size={10} className="text-gray-700 group-hover:text-white transition-colors duration-200" />
                </a>
              </li>
            ))}
          </ul>
        </div>

        {/* Developer Info */}
        <div className="col-span-1 sm:col-span-6 md:col-span-3 space-y-4">
          <h4 className="text-[10px] font-black text-gray-600 uppercase tracking-[0.3em]">Developer</h4>
          <div className="space-y-2">
            <a
              href="https://shaurya-upadhyay.me"
              target="_blank"
              rel="noopener noreferrer"
              className="block group"
            >
              <span className="text-xs font-black text-gray-400 group-hover:text-white transition-colors uppercase tracking-widest block">
                Shaurya Upadhyay
              </span>
              <span className="text-[9px] font-bold text-gray-600 uppercase tracking-widest block">
                Full-Stack Engineer
              </span>
            </a>

            <div className="pt-3 border-t border-white/5 mt-3">
              <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest block">Modified & Further Developed by</span>
              <span className="text-sm font-black text-orange-400 uppercase tracking-widest block mt-0.5">Vamshi Nakkala</span>
              <a
                href="https://github.com/vamshi321-coder/crickauction"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 mt-1.5 text-[9px] font-black text-gray-500 hover:text-white uppercase tracking-widest transition-colors"
              >
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path></svg>
                GitHub Repo
              </a>
              <div className="mt-3 pt-3 border-t border-white/5">
                <span className="text-[8px] font-black text-gray-700 uppercase tracking-widest block">Original project by</span>
                <span className="text-[10px] font-black text-gray-600 uppercase tracking-widest block mt-0.5">Shaurya Upadhyay</span>
                <p className="text-[8px] text-gray-700 mt-0.5">This project is a modified version based on the original work.</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="w-full h-px bg-white/5 mb-8" />

      {/* Bottom Row */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <p className="text-[9px] font-black text-gray-600 uppercase tracking-widest text-center sm:text-left leading-relaxed">
          &copy; {currentYear} IPL Auction Hub. All rights reserved. 🏏
        </p>
        <div className="flex items-center gap-2.5">
          <ShieldCheck size={12} className="text-[#ff5500]/70" />
          <span className="text-[9px] font-black text-gray-600 uppercase tracking-[0.2em] leading-none">
            Secure Realtime Sync Enabled
          </span>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
