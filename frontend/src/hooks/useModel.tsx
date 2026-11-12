import React, { useState, ReactNode } from 'react';
import { ModelContext } from './modelContext';

// The context object and the useModel hook live in ./modelContext so that this
// file only exports a component — required for React Fast Refresh. Import the
// hook from './hooks/modelContext', not from here.

interface ModelProviderProps {
  children: ReactNode;
}

export const ModelProvider: React.FC<ModelProviderProps> = ({ children }) => {
  const [selectedModel, setSelectedModel] = useState('us.anthropic.claude-opus-5-5');

  return (
    <ModelContext.Provider value={{ selectedModel, setSelectedModel }}>
      {children}
    </ModelContext.Provider>
  );
};
