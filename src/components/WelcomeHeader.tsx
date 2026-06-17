import React from 'react';

export const WelcomeHeader: React.FC = () => {
  return (
    <div className="relative py-16 text-center overflow-hidden rounded-lg">
      {/* Background image */}
      <div 
        className="absolute inset-0 bg-cover bg-center"
        style={{ 
          backgroundImage: 'url(/header.jpeg)',
          filter: 'brightness(0.4)'
        }}
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

