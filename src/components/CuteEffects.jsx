// src/components/CuteEffects.jsx
import React, { useEffect, useState } from 'react';

const CuteEffects = () => {
  const [hearts, setHearts] = useState([]);
  const [sparkles, setSparkles] = useState([]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (Math.random() > 0.7) {
        const newHeart = {
          id: Date.now(),
          left: Math.random() * 100,
          delay: Math.random() * 5,
          size: Math.random() * 20 + 10
        };
        setHearts(prev => [...prev.slice(-10), newHeart]);
        
        setTimeout(() => {
          setHearts(prev => prev.filter(h => h.id !== newHeart.id));
        }, 6000);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleClick = (e) => {
      const sparkle = {
        id: Date.now(),
        x: e.clientX,
        y: e.clientY,
        size: Math.random() * 15 + 5
      };
      setSparkles(prev => [...prev, sparkle]);
      
      setTimeout(() => {
        setSparkles(prev => prev.filter(s => s.id !== sparkle.id));
      }, 1500);
    };

    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  return (
    <>
      {[...Array(4)].map((_, i) => (
        <div 
          key={i} 
          className="paw-trail"
          style={{
            animationDelay: `${i * 5}s`,
            top: `${Math.random() * 100}%`
          }}
        />
      ))}

      {hearts.map(heart => (
        <div
          key={heart.id}
          className="floating-heart"
          style={{
            left: `${heart.left}vw`,
            top: '100vh',
            animationDelay: `${heart.delay}s`,
            fontSize: `${heart.size}px`,
            color: ['#ffb6c1', '#e6e6fa', '#b2f2bb'][Math.floor(Math.random() * 3)]
          }}
        >
          {['❤️', '💖', '💝', '💗', '💓'][Math.floor(Math.random() * 5)]}
        </div>
      ))}

      {sparkles.map(sparkle => (
        <div
          key={sparkle.id}
          className="sparkle"
          style={{
            left: `${sparkle.x}px`,
            top: `${sparkle.y}px`,
            width: `${sparkle.size}px`,
            height: `${sparkle.size}px`
          }}
        />
      ))}

      <div style={{
        position: 'fixed',
        top: '20px',
        right: '20px',
        fontSize: '2rem',
        opacity: 0.1,
        zIndex: 0,
        pointerEvents: 'none'
      }}>
        🐱
      </div>
      <div style={{
        position: 'fixed',
        bottom: '20px',
        left: '20px',
        fontSize: '2rem',
        opacity: 0.1,
        zIndex: 0,
        pointerEvents: 'none'
      }}>
        🐾
      </div>
    </>
  );
};

export default CuteEffects;