import React from 'react';

export const WelcomeHeader: React.FC = () => {
  return (
    <div className="relative py-16 text-center overflow-hidden rounded-lg">
      {/* Background image. An <img> rather than a CSS background so the preload
          in index.html applies and the browser can pick a size per viewport. */}
      <img
        src="/img/header-1066.webp"
        srcSet="/img/header-640.webp 640w, /img/header-800.webp 800w, /img/header-1066.webp 1066w"
        sizes="100vw"
        alt=""
        aria-hidden="true"
        width={1066}
        height={1600}
        fetchPriority="high"
        decoding="async"
        className="absolute inset-0 w-full h-full object-cover object-center brightness-[0.4]"
      />
      
      {/* Overlay gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/50 to-black/70" />
      
      {/* Content */}
      <div className="relative z-10 px-4">
        <h1 className="text-4xl font-bold text-white mb-4 drop-shadow-lg tracking-wider">WELCOME TO TURBO</h1>
        <p className="text-white/90 text-base md:text-lg drop-shadow-md leading-relaxed whitespace-pre-line">
{`Where premium hookah meets creativity.

Discover carefully crafted signature blends or create your own unique mix through our menu.

Every session reflects your taste.
Every flavour tells your story.

Your blend.
Your moment.
Your Turbo experience.`}
        </p>
      </div>
    </div>
  );
};

