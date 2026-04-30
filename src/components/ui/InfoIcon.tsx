'use client';

import { useState, useRef, useEffect, useId } from 'react';
import { createPortal } from 'react-dom';

interface InfoIconProps {
  term: string;
  tooltip: string;
  testId?: string;
}

export default function InfoIcon({ term, tooltip, testId }: InfoIconProps) {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, alignRight: false });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [mounted, setMounted] = useState(false);
  const tooltipId = useId();

  useEffect(() => {
    setMounted(true);
  }, []);

  function updatePosition() {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const popupWidth = 220;
    const spaceRight = window.innerWidth - rect.left;
    const alignRight = spaceRight < popupWidth + 16;
    setPos({
      top: rect.bottom + window.scrollY + 6,
      left: alignRight
        ? rect.right + window.scrollX - popupWidth
        : rect.left + window.scrollX,
      alignRight,
    });
  }

  // Re-position (or close) the portalled tooltip when the user scrolls or
  // resizes the window while it is open. Updates are throttled via rAF to
  // avoid layout thrash on rapid scroll events.
  useEffect(() => {
    if (!show) return;

    let frameId: number | null = null;

    const handleViewportChange = () => {
      if (frameId !== null) return;

      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        updatePosition();
      });
    };

    handleViewportChange();
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);

    return () => {
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show]);

  function open() {
    updatePosition();
    setShow(true);
  }

  function close() {
    setShow(false);
  }

  const popup = show && mounted && createPortal(
    <div
      id={tooltipId}
      role="tooltip"
      data-testid={testId ? `${testId}-tooltip` : undefined}
      style={{
        position: 'absolute',
        top: pos.top,
        left: pos.left,
        zIndex: 9999,
        width: 220,
      }}
      className="p-2.5 text-xs text-slate-700 bg-white border border-slate-200 rounded-lg shadow-xl leading-relaxed"
    >
      <span className="font-bold text-slate-900 block mb-0.5">{term}</span>
      {tooltip}
    </div>,
    document.body,
  );

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onMouseEnter={open}
        onMouseLeave={close}
        onFocus={open}
        onBlur={close}
        onClick={() => (show ? close() : open())}
        aria-label={`What is ${term}?`}
        aria-haspopup="dialog"
        aria-expanded={show}
        aria-controls={tooltipId}
        aria-describedby={show ? tooltipId : undefined}
        data-testid={testId}
        className="inline-flex items-center justify-center w-5 h-5 ml-1 rounded-full bg-slate-200 hover:bg-slate-300 text-slate-600 hover:text-slate-800 text-xs font-bold flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
      >
        <span aria-hidden="true">ℹ</span>
      </button>
      {popup}
    </>
  );
}
