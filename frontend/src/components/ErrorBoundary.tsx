import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-[#060608] px-6 text-center">
          <p className="mb-4 text-5xl">💥</p>
          <h1 className="mb-2 text-2xl font-bold text-white">
            Something went wrong
          </h1>
          <p className="mb-8 text-sm text-white/40">
            予期しないエラーが発生しました
          </p>
          <button
            onClick={() => {
              this.setState({ hasError: false });
              window.location.href = '/';
            }}
            className="rounded-full bg-white px-8 py-3 text-sm font-semibold text-black transition-opacity hover:opacity-90"
          >
            トップに戻る
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
