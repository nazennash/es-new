import React from 'react';

export const difficulties = [
  { id: 'easy', label: 'Easy', grid: { x: 4, y: 3 }, icon: '🟢' },
  { id: 'medium', label: 'Medium', grid: { x: 5, y: 4 }, icon: '🟡' },
  { id: 'hard', label: 'Hard', grid: { x: 6, y: 5 }, icon: '🟠' },
  { id: 'expert', label: 'Expert', grid: { x: 8, y: 6 }, icon: '🔴' }
];

const DifficultyBar = ({ selectedDifficulty, onSelect, className }) => {
  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {difficulties.map((difficulty) => (
        <button
          key={difficulty.id}
          onClick={() => onSelect(difficulty)}
          className={`
            px-3 py-1.5 rounded-full text-sm font-medium
            transition-all duration-200 transform hover:scale-105
            flex items-center gap-1.5
            ${
              selectedDifficulty.id === difficulty.id
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30'
                : 'bg-gray-700/50 text-gray-300 hover:bg-gray-700'
            }
          `}
        >
          <span className="hidden sm:inline">{difficulty.icon}</span>
          <span>{difficulty.label}</span>
        </button>
      ))}
    </div>
  );
};

export default DifficultyBar;