// src/components/CulturalPuzzleSelector.jsx
import React, { useState, useEffect } from 'react';
import { culturalPuzzles } from '../data/culturalPuzzles';
import { FaCrown } from 'react-icons/fa';
import { getFirestore, doc, onSnapshot } from "firebase/firestore";

const db = getFirestore();
const useUserSubscription = (userId) => {
  const [subscription, setSubscription] = useState({ planId: "free", status: "inactive" });

  useEffect(() => {
    if (!userId) return;

    const subscriptionRef = doc(db, 'subscriptions', userId);
    const unsubscribe = onSnapshot(subscriptionRef, (docSnap) => {
      if (docSnap.exists()) {
        setSubscription(docSnap.data());
      } else {
        setSubscription({ planId: "free", status: "inactive" });
      }
    });

    return () => unsubscribe();
  }, [userId]);

  return subscription;
};

const CulturalPuzzleSelector = ({ onSelect, user }) => {
  const subscription = useUserSubscription(user?.uid);
  const isPremium = subscription.planId === "pro" && subscription.status === "active";

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-6">
      {culturalPuzzles.map(puzzle => (
        <div
          key={puzzle.id}
          className={`bg-white rounded-lg shadow-lg overflow-hidden hover:shadow-xl transition-shadow relative ${
            puzzle.premium && !isPremium ? 'opacity-50 cursor-not-allowed' : ''
          }`}
        >
          {puzzle.premium && !isPremium && (
            <div className="absolute top-2 right-2 bg-yellow-500 text-white px-2 py-1 rounded-full flex items-center gap-1">
              <FaCrown className="w-4 h-4" />
              <span className="text-sm">Premium</span>
            </div>
          )}
          <img
            src={puzzle.thumbnail}
            alt={puzzle.name}
            className="w-full h-48 object-cover"
          />
          <div className="p-4">
            <h3 className="text-xl font-bold mb-2">{puzzle.name}</h3>
            <p className="text-gray-600 mb-4">{puzzle.description}</p>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">
                {puzzle.pieces} pieces • {puzzle.difficulty}
              </span>
              <button
                onClick={() => {
                  if (puzzle.premium && !isPremium) {
                    alert('Upgrade to Premium to access this puzzle!');
                  } else {
                    onSelect(puzzle);
                  }
                }}
                className={`px-4 py-2 ${
                  puzzle.premium && !isPremium ? 'bg-gray-400' : 'bg-blue-500'
                } text-white rounded hover:bg-blue-600`}
                disabled={puzzle.premium && !isPremium}
              >
                {puzzle.premium && !isPremium ? 'Premium Only' : 'Start Puzzle'}
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default CulturalPuzzleSelector;