'use client';

import React from 'react';

interface AIBackgroundProps {
  isProcessing?: boolean;
  isSuccess?: boolean;
}

export default function AIBackground({ isProcessing = false, isSuccess = false }: AIBackgroundProps) {
  return (
    <div className="fixed top-[80px] left-4 right-4 bottom-4 sm:top-[96px] sm:left-6 sm:right-6 sm:bottom-6 z-0 pointer-events-none overflow-hidden rounded-[36px] bg-[#121317]">
      <video 
        autoPlay 
        muted 
        loop 
        playsInline
        className={`absolute inset-0 w-full h-full object-cover transition-all duration-700 ease-in-out ${
          isSuccess ? 'scale-105 brightness-110' : isProcessing ? 'scale-95 opacity-80' : 'scale-100'
        }`}
      >
        <source src="/gemma__page-cover__gemma__dark__4k.webm" type="video/webm" />
      </video>
      
      {/* 12. CONTENT PROTECTION overlay to ensure readability */}
      <div 
        className="absolute inset-0 transition-opacity duration-500"
        style={{
          background: 'radial-gradient(circle at center, rgba(18, 19, 23, 0.1), rgba(18, 19, 23, 0.5))',
          pointerEvents: 'none'
        }}
      />
      
      {/* Success blue flash overlay */}
      <div 
        className={`absolute inset-0 transition-opacity duration-700 pointer-events-none ${
          isSuccess ? 'opacity-20' : 'opacity-0'
        }`}
        style={{
          background: 'radial-gradient(circle at center, #9dd2ff, transparent 60%)'
        }}
      />
    </div>
  );
}
