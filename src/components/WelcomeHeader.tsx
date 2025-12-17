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
      <div className="relative z-10">
        <h1 className="text-4xl font-bold text-white mb-3 drop-shadow-lg">Bine ai venit la Turbo!</h1>
        <p className="text-white/90 text-lg drop-shadow-md">Îți mulțumim că ne-ai ales! Ce ai dori să comanzi astăzi?</p>
      </div>
    </div>
  );
};

