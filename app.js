// Configura aquí el WhatsApp del negocio: código de país + número, sin signos ni espacios.
const WHATSAPP_NUMBER = '5210000000000';
const state = { month: new Date(new Date().getFullYear(), new Date().getMonth(), 1), start: null, end: null };
const months = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const dayGrid = document.querySelector('#calendar-days');
const iso = date => date.toISOString().slice(0, 10);
const today = new Date(); today.setHours(0,0,0,0);
const humanDate = date => date ? date.toLocaleDateString('es-MX',{day:'numeric',month:'short',year:'numeric'}) : 'Elige una fecha';
function isBetween(date) { return state.start && state.end && date > state.start && date < state.end; }
function renderCalendar() {
  const { month } = state; const year = month.getFullYear(), number = month.getMonth();
  document.querySelector('#calendar-title').textContent = `${months[number]} ${year}`;
  dayGrid.innerHTML = '';
  const first = (new Date(year,number,1).getDay()+6)%7, count = new Date(year,number+1,0).getDate();
  for(let i=0;i<first;i++) dayGrid.append(Object.assign(document.createElement('span'),{className:'day blank'}));
  for(let n=1;n<=count;n++) { const date = new Date(year,number,n), button = document.createElement('button'); button.type='button'; button.className='day'; button.textContent=n; button.disabled=date<today;
    if (state.start && iso(date)===iso(state.start) || state.end && iso(date)===iso(state.end)) button.classList.add('selected');
    if(isBetween(date)) button.classList.add('in-range');
    button.addEventListener('click',()=>selectDate(date)); dayGrid.append(button); }
  document.querySelector('#start-display').textContent=humanDate(state.start); document.querySelector('#end-display').textContent=humanDate(state.end);
}
function selectDate(date){ if(!state.start || state.end || date<state.start){state.start=date;state.end=null}else{state.end=date} renderCalendar(); }
document.querySelector('#previous-month').onclick=()=>{state.month=new Date(state.month.getFullYear(),state.month.getMonth()-1,1);renderCalendar()};
document.querySelector('#next-month').onclick=()=>{state.month=new Date(state.month.getFullYear(),state.month.getMonth()+1,1);renderCalendar()};
document.querySelector('#clear-dates').onclick=()=>{state.start=null;state.end=null;renderCalendar()};
document.querySelector('#booking-form').addEventListener('submit', event=>{event.preventDefault();const name=document.querySelector('#name').value.trim(),phone=document.querySelector('#phone').value.trim(),message=document.querySelector('#form-message');if(!state.start||!state.end){message.textContent='Selecciona una fecha de inicio y una fecha de fin.';return}if(phone.replace(/\D/g,'').length<10){message.textContent='Escribe un teléfono válido (al menos 10 dígitos).';return}const text=`Hola, soy ${name}. Quiero solicitar una Nissan Urvan del ${humanDate(state.start)} al ${humanDate(state.end)}. Mi teléfono es ${phone}. ¿Me confirman disponibilidad?`;window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`,'_blank','noopener');message.textContent=''});
document.querySelectorAll('.whatsapp-link').forEach(link=>{link.href=`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(link.dataset.message||'Hola')}`});
document.querySelector('.menu-button').onclick=event=>{const nav=document.querySelector('.main-nav');nav.classList.toggle('open');event.currentTarget.setAttribute('aria-expanded',nav.classList.contains('open'))};
document.querySelector('#year').textContent=new Date().getFullYear();renderCalendar();
