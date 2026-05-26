import React from 'react';

export const WelcomeHeader: React.FC = () => {
  return (
    <div className="relative py-16 text-center overflow-hidden rounded-lg">
      {/* Background image */}
      <div 
        className="absolute inset-0 bg-cover bg-center"
        style={{ 
          backgroundImage: 'url(https://images.unsplash.com/photo-1544148103-0773bf10d330?w=1200&h=400&fit=crop)',
          filter: 'brightness(0.4)'
        }}
      />
      
      {/* Overlay gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/50 to-black/70" />
      
      {/* Content */}
      <div className="relative z-10 px-4">
        <h1 className="text-4xl font-bold text-white mb-4 drop-shadow-lg tracking-wider">WELCOME TO TURBO</h1>
        <p className="text-white/90 text-base md:text-lg drop-shadow-md leading-relaxed whitespace-pre-line">
{`WHERE HOOKAH LOVERS
COME TO RELAX,
CONNECT AND ENJOY
PREMIUM MIXES.

EVERY SESSION
CREATES MEMORIES.
EVERY FLAVOUR
BRINGS A NEW VIBE.

TOGETHER WE SMOKE,
TOGETHER WE FEEL.`}
        </p>
      </div>
    </div>
  );
};

