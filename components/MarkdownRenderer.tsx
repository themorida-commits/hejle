import React from 'react';

export function MarkdownRenderer({ content }: { content: string }) {
    // Split the content by code blocks first to isolate them
    const blocks = content.split(/(```[\s\S]*?```)/g);

    return (
        <div className="text-gray-800">
            {blocks.filter(block => block.trim()).map((block, index) => {
                if (block.startsWith('```') && block.endsWith('```')) {
                    // This is a code block
                    const code = block.slice(3, -3).trim();
                    return (
                        <pre key={index} className="bg-gray-800 text-white p-4 my-2 rounded-md overflow-x-auto text-sm font-mono">
                            <code>{code}</code>
                        </pre>
                    );
                }

                // This is a regular text block, process for tables
                const lines = block.split('\n');
                const elements: React.ReactNode[] = [];
                let tableLines: string[] = [];

                const flushTable = () => {
                    if (tableLines.length < 2) {
                        // Not enough lines for a header and separator, treat as plain text
                        if (tableLines.length > 0) {
                            elements.push(<pre key={`pre-${index}-${elements.length}`} className="whitespace-pre-wrap font-sans">{tableLines.join('\n')}</pre>);
                        }
                        tableLines = [];
                        return;
                    }

                    const [headerLine, separatorLine, ...bodyLines] = tableLines;
                    const headerCells = headerLine.split('|').slice(1, -1);
                    
                    if (!separatorLine.includes('---')) {
                        // No valid separator, treat as plain text
                        elements.push(<pre key={`pre-${index}-${elements.length}`} className="whitespace-pre-wrap font-sans">{tableLines.join('\n')}</pre>);
                    } else {
                        // This is a valid table
                        const bodyRows = bodyLines.map(line => line.split('|').slice(1, -1));
                        elements.push(
                            <div key={`table-${index}-${elements.length}`} className="overflow-x-auto my-2 border border-gray-300 rounded-lg bg-white shadow">
                                <table className="min-w-full divide-y divide-gray-200">
                                    <thead className="bg-gray-50">
                                        <tr>{headerCells.map((cell, i) => <th key={i} scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">{cell.trim()}</th>)}</tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                        {bodyRows.map((row, i) => <tr key={i} className="hover:bg-gray-50">{row.map((cell, j) => <td key={j} className="px-4 py-4 whitespace-nowrap text-sm text-gray-700 text-center">{cell.trim()}</td>)}</tr>)}
                                    </tbody>
                                </table>
                            </div>
                        );
                    }
                    tableLines = [];
                };
                
                for (const line of lines) {
                    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
                        tableLines.push(line);
                    } else {
                        flushTable();
                        if(line.trim().length > 0) {
                             elements.push(<p key={`p-${index}-${elements.length}`} className="my-1">{line}</p>);
                        }
                    }
                }
                flushTable(); // Flush any remaining table at the end

                return <div key={index}>{elements}</div>;
            })}
        </div>
    );
}