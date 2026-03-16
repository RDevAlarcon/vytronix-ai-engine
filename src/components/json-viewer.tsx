type JsonViewerProps = {
  value: unknown;
};

export const JsonViewer = ({ value }: JsonViewerProps) => {
  return (
    <pre className="overflow-auto rounded-md bg-slate-900 p-4 text-xs text-slate-100">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
};
