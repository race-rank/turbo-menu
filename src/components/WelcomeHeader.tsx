import React from 'react';

export const WelcomeHeader: React.FC = () => {
  return (
    <div className="py-6 text-center">
      <h1 className="text-3xl font-bold text-primary mb-2">Bine ai venit la Turbo!</h1>
      <p className="text-muted-foreground">Îți mulțumim că ne-ai ales! Ce ai dori să comanzi astăzi?</p>
    </div>
  );
};
