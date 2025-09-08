import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';

interface TableContextType {
  table: string | null;
  setTable: (table: string | null) => void;
}

const TableContext = createContext<TableContextType | undefined>(undefined);

export const useTable = () => {
  const context = useContext(TableContext);
  if (!context) throw new Error('useTable must be used within a TableProvider');
  return context;
};

export const TableProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [table, setTable] = useState<string | null>(null);

  useEffect(() => {
    // Check for table param in URL
    const params = new URLSearchParams(window.location.search);
    const tableParam = params.get('table');
    if (tableParam) {
      setTable(tableParam);
      localStorage.setItem('turbo-table', tableParam);
    } else {
      // Fallback to localStorage
      const stored = localStorage.getItem('turbo-table');
      if (stored) setTable(stored);
    }
  }, []);

  return (
    <TableContext.Provider value={{ table, setTable }}>
      {children}
    </TableContext.Provider>
  );
};
