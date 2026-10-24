export const CharacterArt = ({ type = 'rod', small = false }) => {
  const color = type === 'rod' ? '#d89555' : type === 'net' ? '#609d91' : '#6785a9';
  return <svg viewBox="0 0 180 155" className={`character-art ${small ? 'small' : ''}`} role="img" aria-label={`${type} fisherman`} data-testid={`character-art-${type}-${small?'small':'full'}`}>
    <ellipse cx="88" cy="137" rx="57" ry="10" fill="#243f43" opacity=".13" />
    <path d="M29 126L79 104 144 125 93 149Z" fill="#c0dbd1" /><path d="M29 121L79 99 144 120 93 144Z" fill="#e9f2e8" />
    {type === 'boat' && <g><path d="M26 113L81 98 149 112 118 139 58 132Z" fill="#927044" /><path d="M26 106L80 91 149 105 118 130 58 125Z" fill="#c29e69" /><path d="M45 109L82 99 130 108 113 121 62 118Z" fill="#645944" /><path d="M72 109L100 116" stroke="#d1b182" strokeWidth="7" /></g>}
    <path d="M66 100H83V124H61V114H66Z" fill="#3c5658" /><path d="M89 103H105V127H85V118H89Z" fill="#2d4449" />
    <path d="M62 58L97 55 112 65 109 104 75 110 60 99Z" fill={color} /><path d="M97 55L112 65 109 104 96 110Z" fill="#244547" opacity=".25" />
    <path d="M66 60L74 107 87 108 96 58" fill="#e0c38e" /><path d="M68 69L97 66 101 107 72 108Z" fill={color} />
    <path d="M68 25L97 20 110 29 109 60 79 65 67 54Z" fill="#e8bb90" /><path d="M98 26L110 29 109 60 99 64Z" fill="#cc986f" />
    <path d="M63 22L93 16 112 23 115 36 81 43 64 34Z" fill={type === 'boat' ? '#e9e5cf' : color} />
    <path d="M78 12L89 10 97 16 84 20 77 17Z" fill="#e6d5a5" />
    <path d="M67 29L82 36 115 29 115 37 82 45 65 36Z" fill={type === 'boat' ? '#405b6a' : '#ecd7b5'} />
    <path d="M76 51L85 55 105 49 105 64 84 70 76 64Z" fill="#e5e0c9" /><path d="M85 48H90V53H85ZM101 44H106V49H101Z" fill="#263b3c" />
    <path d="M92 51L100 50 100 56 92 58Z" fill="#c78d63" />
    <path d="M54 67L66 65 69 89 59 96 51 88Z" fill={color} /><path d="M52 87L62 86 64 96 55 99Z" fill="#e8bb90" />
    <path d="M107 67L117 68 121 85 111 89 105 80Z" fill={color} /><path d="M111 85L124 82 126 90 115 94Z" fill="#e8bb90" />
    {type === 'rod' && <g><path d="M121 93L144 29 151 22" stroke="#786240" strokeWidth="4" fill="none" /><path d="M151 22L159 103" stroke="#799a90" strokeWidth="1" fill="none" /><rect x="156" y="101" width="6" height="5" fill="#d8844c" /></g>}
    {type === 'net' && <g><path d="M121 91L141 53" stroke="#816b47" strokeWidth="4" /><path d="M132 29L156 31 165 48 146 65 128 51Z" fill="#9fc0ac" fillOpacity=".35" stroke="#8d7854" strokeWidth="3" /><path d="M132 35L153 56M137 31L160 50M130 44L143 59M147 31L132 52M156 38L139 60M162 44L146 63" stroke="#739b88" strokeWidth="1.5" /></g>}
    {type === 'boat' && <path d="M129 71L146 131 154 136 158 131 149 118 133 70Z" fill="#d4b381" />}
    {type !== 'boat' && <g><path d="M32 107L49 104 56 109 54 129 37 131Z" fill="#819e94" /><path d="M37 108L44 103 52 108" fill="none" stroke="#657f7b" strokeWidth="3" /><path d="M40 112L47 106 48 113" stroke="#e9d69e" strokeWidth="5" /></g>}
  </svg>;
};