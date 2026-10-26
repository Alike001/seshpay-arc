/**
 * ErrorBoundary — catches any unhandled rendering exception and shows
 * a recoverable fallback instead of a blank white screen.
 *
 * Usage:
 *   <ErrorBoundary>
 *     <SomeComponent />
 *   </ErrorBoundary>
 *
 * The boundary resets (remounts children) when the user clicks "Try again".
 * A reset key prop is also accepted so a parent can force a reset by changing it.
 */
import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
  /** Optional label shown in the fallback — helps identify which boundary caught. */
  label?: string;
  /** Increment this from outside to force-reset the boundary. */
  resetKey?: string | number;
}

interface State {
  hasError: boolean;
  message: string;
  lastResetKey: string | number | undefined;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      message: "",
      lastResetKey: props.resetKey,
    };
  }

  static getDerivedStateFromError(error: unknown): Partial<State> {
    const message =
      error instanceof Error ? error.message : "An unexpected error occurred.";
    return { hasError: true, message };
  }

  // Reset when the resetKey prop changes
  static getDerivedStateFromProps(
    props: Props,
    state: State
  ): Partial<State> | null {
    if (props.resetKey !== state.lastResetKey) {
      return { hasError: false, message: "", lastResetKey: props.resetKey };
    }
    return null;
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Emit to the console so Arc Studio tracing picks it up
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, message: "" });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const label = this.props.label ?? "This section";

    return (
      <div
        className="rounded-2xl p-6"
        style={{
          background: "rgba(186,43,76,0.06)",
          border: "1px solid rgba(186,43,76,0.14)",
          borderRadius: "16px",
        }}
        role="alert"
        aria-live="assertive"
      >
        <div className="flex items-start gap-3">
          <AlertTriangle
            className="size-5 flex-shrink-0 mt-0.5"
            style={{ color: "var(--danger)" }}
          />
          <div className="flex-1 min-w-0">
            <p
              className="text-sm font-semibold mb-1"
              style={{ color: "var(--ink)" }}
            >
              {label} ran into a problem
            </p>
            <p
              className="text-xs mb-3 font-mono break-words"
              style={{ color: "var(--muted)" }}
            >
              {this.state.message}
            </p>
            <button
              onClick={this.handleReset}
              className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-white"
              style={{ background: "var(--accent)" }}
            >
              <RefreshCw className="size-3" />
              Try again
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
