import React, { useState } from 'react';
import { searchSessions } from '../api/client.js';

interface Props {
  onSelectSession: (id: string) => void;
}

export default function Search({ onSelectSession }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    const data = await searchSessions(query);
    setResults(data.results ?? []);
    setLoading(false);
    setSearched(true);
  };

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">Search</h2>

      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Search across all sessions..."
          className="flex-1 bg-gray-800 border border-gray-600 rounded px-3 py-2 focus:border-cyan-500 focus:outline-none"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
        />
        <button
          className="bg-cyan-700 hover:bg-cyan-600 px-4 py-2 rounded text-sm font-medium"
          onClick={handleSearch}
          disabled={loading}
        >
          {loading ? 'Searching...' : 'Search'}
        </button>
      </div>

      {searched && results.length === 0 && (
        <div className="text-gray-400">No results found.</div>
      )}

      <div className="space-y-4">
        {results.map((result: any) => (
          <div
            key={result.sessionId}
            className="bg-gray-800 border border-gray-700 rounded p-4 cursor-pointer hover:border-cyan-600"
            onClick={() => onSelectSession(result.sessionId)}
          >
            <div className="flex justify-between items-center mb-2">
              <span className="font-mono text-cyan-400 text-sm">{result.sessionId.slice(0, 8)}</span>
              <span className="text-xs text-gray-400">{result.project?.split('/').slice(-2).join('/')}</span>
              <span className="text-xs text-gray-500">{result.totalHits} hit{result.totalHits > 1 ? 's' : ''}</span>
            </div>
            {result.hits?.map((hit: any, i: number) => (
              <div key={i} className="text-sm text-gray-300 py-1 border-t border-gray-700">
                <span className={`text-xs mr-2 ${hit.type === 'user' ? 'text-green-400' : 'text-blue-400'}`}>
                  {hit.type}
                </span>
                {hit.snippet}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
