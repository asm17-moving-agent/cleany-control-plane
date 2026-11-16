import { CadLowerAssembly } from "./CadLowerAssembly";

/** Folded links and jaw mount, projected toward the same front plane as the camera. */
function FoldedCadArm({ x, y }: { x: number; y: number }) {
  return <g transform={`translate(${x} ${y})`} fill="var(--color-auth-background)">
    <path d="m-19 0 23-4 20 9-24 5Z" fill="var(--color-illustration-fill)" />
    <path d="m-13-14 18-3 14 6V4L0 8l-13-6Z" />
    <path d="m-10-26 17-3 10 5v13L0-8l-10-5Z" fill="var(--color-illustration-fill)" />
    <path d="m-8-16 7 3m-7 2 7 3m8-11 7-1m-7 6 7-1" strokeWidth=".8" />
    <path d="m-3-27-48-31-5 10 48 32 10-3Z" />
    <path d="m-43-49 32 21 3-5-32-20Z" fill="var(--color-illustration-fill)" strokeWidth=".8" />
    <path d="m-52-64 11-3 7 7-6 13-11 2-7-8Z" fill="var(--color-illustration-fill)" />
    <ellipse cx="-49" cy="-56" rx="5" ry="6" /><ellipse cx="-49" cy="-56" rx="2" ry="2.6" />
    <path d="m-46-70 57 25 7 9-7 7-57-26-6-8Z" />
    <path d="m-40-64 45 20m-44-15 43 19" opacity=".55" strokeWidth=".8" />
    <path d="m-24-57 22 10v6l-22-10Z" fill="var(--color-illustration-fill)" strokeWidth=".8" />
    <path d="m8-45 9-2 9 7-2 12-11 3-8-8Z" fill="var(--color-illustration-fill)" />
    <ellipse cx="12" cy="-36" rx="5" ry="6" /><ellipse cx="12" cy="-36" rx="2" ry="2.5" />
    <path d="m22-37 10-2 9 4v12l-10 2-9-4Z" />
    <path d="m32-39 17-3 8 4-17 3Zm0 0 8 4v14l-8-4Z" fill="var(--color-illustration-fill)" />
    <path d="m40-35 19-3 5 3-2 3-17 3v9l17-3 4 3-2 3-24 4-6-4v-13Z" />
    <path d="m45-29 12-2m-12 11 12-2" strokeWidth=".8" />
    <path d="m29-40-2-11 9-4 6 9-8 3 1 5Z" fill="var(--color-illustration-fill)" />
  </g>;
}

/** Decorative vector artwork: a study corner and Cleany's mobile, dual-arm form. */
export function AuthBackdrop() {
  return <svg className="auth-backdrop" viewBox="0 0 1440 650" fill="none" aria-hidden="true" focusable="false">
    <g stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round">
      <path d="M45 565H1395" opacity=".45" />
      {/* Quiet study corner, with a shared floor and shallow furniture perspective. */}
      <g className="auth-cafe-art">
        <ellipse cx="228" cy="558" rx="164" ry="9" stroke="none" fill="var(--color-illustration-fill)" fillOpacity=".3" />
        <g data-cafe-part="arched-window">
          <path d="M100 288V141a81 81 0 0 1 162 0v147Z" fill="var(--color-auth-background)" />
          <path d="M110 278V142a71 71 0 0 1 142 0v136Z" />
          <path d="M178 72v206m6-206v206M110 174h142m-142 5h142" opacity=".55" />
          <path d="m123 129 27-27m-27 45 38-38m47 104 21-21m-16 34 27-27" opacity=".3" />
          <path d="M95 285h172v9H95Zm6 9 5 5h150l6-5" fill="var(--color-illustration-fill)" fillOpacity=".65" />
          <path d="M135 179v55m90-55v55" opacity=".65" />
          <rect x="120" y="234" width="120" height="33" rx="3" fill="var(--color-auth-background)" />
          <path d="M125 239h110v23H125Z" opacity=".4" />
          <text x="181" y="255" textAnchor="middle" stroke="none" fill="currentColor" fontSize="9" letterSpacing="2.4" fontFamily="inherit">STUDY CAFE</text>
        </g>
        <g data-cafe-part="pendant">
          <path d="M294 53h16v5h-16Zm8 5v91" />
          <path d="M296 149h12v8h-12Z" fill="var(--color-illustration-fill)" />
          <path d="m282 157-14 30q34 8 68 0l-14-30Z" fill="var(--color-illustration-fill)" fillOpacity=".65" />
          <path d="M268 187q34-7 68 0m-47-26-8 19" opacity=".6" />
          <path d="M295 191q0 10 7 10t7-10" />
          <path d="m282 213-5 8m25-6v10m20-12 5 8" opacity=".3" />
        </g>
        <g data-cafe-part="desk">
          <path d="m101 360 7 181h7l-4-181m247 0-4 181h7l7-181" fill="var(--color-illustration-fill)" fillOpacity=".6" />
          <path d="M105 410h256" opacity=".45" />
          <path d="m85 360-10 203h9l13-203m279 0 12 203h9l-9-203" fill="var(--color-auth-background)" />
          <path d="M93 374h289v15H93Z" fill="var(--color-illustration-fill)" fillOpacity=".5" />
          <path d="M81 341h310l15 10H67Z" fill="var(--color-auth-background)" />
          <path d="M67 351h339v12H67Z" fill="var(--color-illustration-fill)" fillOpacity=".6" />
          <path d="M73 355h327" opacity=".35" />
          <circle cx="98" cy="382" r="1.7" /><circle cx="376" cy="382" r="1.7" />
          <path d="M75 563h9m304 0h9" />
        </g>
        <g data-cafe-part="books">
          <path d="M116 329h91v12h-91Z" fill="var(--color-auth-background)" />
          <path d="M113 328h96m-96 14h96m-88-10h79m-79 5h79" opacity=".65" />
          <path d="M124 316h71v12h-71Z" fill="var(--color-illustration-fill)" />
          <path d="M131 317v10m55-10v10" opacity=".5" />
          <path d="m133 307 76-5 1 12-76 5Z" fill="var(--color-auth-background)" />
          <path d="m138 311 65-4m-65 7 65-4" opacity=".5" />
          <path d="m184 305 7-1 1 10-4-2-3 3Z" fill="var(--color-illustration-fill)" />
        </g>
        <g data-cafe-part="coffee">
          <ellipse cx="258" cy="340" rx="32" ry="4" fill="var(--color-illustration-fill)" fillOpacity=".55" />
          <path d="M276 310h5q10 0 9 9t-15 10m1-14h4q5 0 4 5t-8 5" />
          <path d="m234 307 4 26q1 7 18 7t18-7l4-26" fill="var(--color-auth-background)" />
          <ellipse cx="256" cy="307" rx="22" ry="4.5" fill="var(--color-illustration-fill)" />
          <path d="m240 314 2 14m5-31c-9-10 7-13 0-23m13 23c-9-10 7-13 0-23" opacity=".65" />
        </g>
        <g data-cafe-part="desk-plant">
          <path d="M320 318h34l-4 23h-26Z" fill="var(--color-illustration-fill)" fillOpacity=".65" />
          <path d="M318 315h38v5h-38Z" fill="var(--color-auth-background)" />
          <path d="M337 315v-35m0 20q-23-1-21-20 19 2 21 20Zm0-8q1-23 21-24-1 19-21 24Z" fill="var(--color-auth-background)" />
          <path d="m321 286 16 14m15-25-15 17m-10 33 2 10" opacity=".5" />
        </g>
        <g data-cafe-part="chair">
          <path d="m197 448 3 106m48-106-3 106" opacity=".65" />
          <path d="M191 434v15m65-15v15" />
          <path d="M184 432c-1-10-2-22-1-32 1-13 7-20 19-20h43c12 0 18 7 19 20 1 10 0 22-1 32q-1 7-10 7h-59q-9 0-10-7Z" fill="var(--color-auth-background)" />
          <path d="M190 401q0-14 13-14h41q13 0 14 14m-66 27h64" opacity=".45" />
          <path d="m189 457-9 106h8l12-106m48 0 12 106h8l-9-106" fill="var(--color-auth-background)" />
          <path d="M189 527h70" opacity=".7" />
          <path d="M183 446h80q12 0 13 7v7H175v-7q1-7 8-7Z" fill="var(--color-illustration-fill)" />
          <path d="M176 453h99m-93 110h6m72 0h8" />
        </g>
        <g data-cafe-part="floor-plant">
          <path d="M81 496c3-34-4-61 0-92" />
          <path d="M82 468q-37-6-36-34 28 6 36 34Zm0-12q31-3 34-30-29 3-34 30Zm-1-20q-21-27-8-46 17 17 8 46Zm0 4q2-22 21-29-1 21-21 29Z" fill="var(--color-auth-background)" />
          <path d="m52 442 30 26m26-34-26 22m-8-53 7 33m15-17-15 21" opacity=".45" />
          <path d="M58 495h47l-7 65q-16 5-31 0Z" fill="var(--color-illustration-fill)" fillOpacity=".65" />
          <path d="M57 491h49v7H57Z" fill="var(--color-auth-background)" />
          <path d="m66 506 6 44m-5 10v5h31v-5" opacity=".55" />
        </g>
        <path d="M351 453q0 9-9 9 9 0 9 9 0-9 9-9-9 0-9-9Z" opacity=".5" />
        <circle cx="380" cy="270" r="4" /><circle cx="59" cy="234" r="2.5" />
      </g>
      {/* Cleany: mobile base, collection body, two arms and camera mast. */}
      <g className="auth-cleany-art">
        <ellipse cx="1190" cy="533" rx="145" ry="29" transform="rotate(-6 1190 533)" stroke="none" fill="var(--color-illustration-fill)" fillOpacity=".3" />
        {/* The camera, display and grippers share the cabinet's forward-facing projection. */}
        <g data-robot-part="cad-robot" transform="translate(1074 175)" fill="var(--color-auth-background)">
          <g data-robot-part="exposed-frame">
            <path d="m0 254 82 36 152-28v34L82 324 0 288Z" fill="var(--color-illustration-fill)" />
            <path d="m5 258 7 3v27l-7-3Zm67 29 7 3v28l-7-3Zm16 3 7-1v28l-7 1Zm132-25 7-1v28l-7 1Z" />
            <path d="m8 260 0 26m67 3v27m17-26v26m132-50v26m-220-14 78 34 148-27" strokeWidth=".7" />
          </g>
          <CadLowerAssembly />
          <text data-robot-part="wordmark" x="0" y="0" textAnchor="middle" dominantBaseline="central" stroke="none" fill="currentColor" fontSize="20" fontWeight="650" fontFamily="inherit" transform="matrix(1 -.1842 0 1 159 331.8)">cleany</text>
          <g fill="currentColor" stroke="none" opacity=".65">
            <circle cx="7" cy="289" r="1.2" />
            <circle cx="74" cy="319" r="1.2" />
            <circle cx="91" cy="322" r="1.2" /><circle cx="91" cy="362" r="1.2" />
            <circle cx="226" cy="297" r="1.2" /><circle cx="226" cy="326" r="1.2" />
          </g>
          <g data-robot-part="upper-cabinet">
            <path d="m0 135 82 36 152-28v132L82 303 0 267Z" />
            <path d="m0 135 82 36v132L0 267Z" fill="var(--color-illustration-fill)" fillOpacity=".3" />
            <path d="m0 135 152-28 82 36-152 28Z" fill="var(--color-illustration-fill)" fillOpacity=".65" />
            <path d="m8 135 144-24 72 31-142 25Z" />
            <path d="m8 135 74 32 142-25m-142 25v-5l134-24m-64-27v5l-135 23" strokeWidth=".85" />
            <path d="m0 140 82 36 152-28M82 176v127" />
            <g fill="currentColor" stroke="none" opacity=".65">
              <circle cx="7" cy="151" r="1.1" /><circle cx="7" cy="255" r="1.1" />
              <circle cx="74" cy="181" r="1.1" /><circle cx="74" cy="284" r="1.1" />
              <circle cx="90" cy="182" r="1.1" /><circle cx="90" cy="289" r="1.1" />
              <circle cx="226" cy="157" r="1.1" /><circle cx="226" cy="264" r="1.1" />
            </g>
          </g>
          <g data-robot-part="face-display">
            <path d="m102 207 111-21v58l-111 21Z" fill="var(--color-illustration-fill)" />
            <path d="m106 210 103-19v49l-103 19Z" strokeWidth=".7" opacity=".6" />
            <g transform="matrix(1 -.184 0 1 129 218)" fill="currentColor" stroke="none" opacity=".8">
              <rect width="13" height="18" rx="4" /><rect x="35" width="13" height="18" rx="4" />
              <path d="M21 23q3 5 7 0" fill="none" stroke="currentColor" strokeWidth="1.5" />
            </g>
          </g>
          <g data-robot-part="right-arm"><FoldedCadArm x={187} y={139} /></g>
          <g data-robot-part="lattice-camera-mast">
            <path d="m108 141 26-5 25 11-27 5Z" fill="var(--color-illustration-fill)" />
            <path d="m113 127 20-4 19 8v15l-20 4-19-8Z" />
            <path d="m118 135 9 4v6l-9-4Zm17 5 12-3v6l-12 3Z" fill="var(--color-illustration-fill)" strokeWidth=".8" />
            <path d="m119 40 12 5 18-3v88l-18 4-12-5Z" fill="var(--color-illustration-fill)" />
            <path d="m131 45 18-3v88l-18 4Z" />
            <g strokeWidth=".85">
              <path d="m122 47 6 3v13Zm0 8 6 13-6-3Zm0 18 6 3v13Zm0 8 6 13-6-3Zm0 18 6 3v13Zm0 8 6 13-6-3Z" />
              <path d="m135 49 10-2-10 15Zm10 7v12l-10 2Zm-10 21 10-2-10 15Zm10 7v12l-10 2Zm-10 21 10-2-10 15Zm10 7v12l-10 2Z" fill="var(--color-illustration-fill)" fillOpacity=".65" />
            </g>
            <path d="m119 40 12 5 18-3m-18 3v89m-12-65 12 5 18-3m-30 24 12 5 18-3" strokeWidth=".8" />
            <path d="m119 30 13-3 17 7v9l-18 3-12-5Z" />
            <path d="m126 15 12-2 7 4v14l-12 3-7-4Z" fill="var(--color-illustration-fill)" />
            <path d="m130 19 3 2 8-2v8l-8 2-3-2Z" />
            <g data-robot-part="forward-camera">
              <path d="m109 4 38-7 10 5v14l-38 7-10-5Z" />
              <path d="m109 4 10 5 38-7m-38 7v14" />
              <path d="m122 11 32-6v9l-32 6Z" fill="var(--color-illustration-fill)" strokeWidth=".8" />
              <ellipse cx="127" cy="14" rx="2" ry="2.5" /><ellipse cx="149" cy="10" rx="2.3" ry="2.8" />
              <path d="m134 13 8-1.5" strokeWidth=".8" />
            </g>
          </g>
          <g data-robot-part="left-arm"><FoldedCadArm x={74} y={161} /></g>
        </g>
        <g data-decoration="speech-bubble" fill="var(--color-auth-background)">
          <path d="M1299 169h75v44h-45l-16 13v-13h-14Z" />
          <path d="M1314 184h44m-44 13h29" />
        </g>
        <circle cx="1354" cy="245" r="3" /><circle cx="1058" cy="436" r="4" />
      </g>
    </g>
  </svg>;
}
