import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('页面渲染失败', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <main className="error-boundary" role="alert">
          <div>
            <h1>页面遇到异常</h1>
            <p>{this.state.error.message || '未知错误'}</p>
            <div className="error-boundary-actions">
              <button type="button" className="primary-btn" onClick={() => this.setState({ error: null })}>
                重试渲染
              </button>
              <button type="button" className="ghost-btn" onClick={() => window.location.reload()}>
                刷新页面
              </button>
            </div>
          </div>
        </main>
      )
    }

    return this.props.children
  }
}
