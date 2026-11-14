// Registro explicito de iconos (Material Symbols Rounded). Para agregar uno, importarlo aqui.
// Cada icono hereda `currentColor`. Los cuatro de navegacion tienen version rellena.
import Grass from '@material-symbols/svg-400/rounded/grass.svg?react'
import GrassRelleno from '@material-symbols/svg-400/rounded/grass-fill.svg?react'
import Map from '@material-symbols/svg-400/rounded/map.svg?react'
import MapRelleno from '@material-symbols/svg-400/rounded/map-fill.svg?react'
import WaterDrop from '@material-symbols/svg-400/rounded/water_drop.svg?react'
import WaterDropRelleno from '@material-symbols/svg-400/rounded/water_drop-fill.svg?react'
import Forum from '@material-symbols/svg-400/rounded/forum.svg?react'
import ForumRelleno from '@material-symbols/svg-400/rounded/forum-fill.svg?react'
import VolumeUp from '@material-symbols/svg-400/rounded/volume_up.svg?react'
import VolumeOff from '@material-symbols/svg-400/rounded/volume_off.svg?react'
import Add from '@material-symbols/svg-400/rounded/add.svg?react'
import Remove from '@material-symbols/svg-400/rounded/remove.svg?react'
import Send from '@material-symbols/svg-400/rounded/send.svg?react'
import ArrowForward from '@material-symbols/svg-400/rounded/arrow_forward.svg?react'
import ArrowBack from '@material-symbols/svg-400/rounded/arrow_back.svg?react'
import Layers from '@material-symbols/svg-400/rounded/layers.svg?react'
import MyLocation from '@material-symbols/svg-400/rounded/my_location.svg?react'
import ContentCopy from '@material-symbols/svg-400/rounded/content_copy.svg?react'
import Thermostat from '@material-symbols/svg-400/rounded/thermostat.svg?react'
import Rainy from '@material-symbols/svg-400/rounded/rainy.svg?react'
import Landscape from '@material-symbols/svg-400/rounded/landscape.svg?react'
import Delete from '@material-symbols/svg-400/rounded/delete.svg?react'
import Info from '@material-symbols/svg-400/rounded/info.svg?react'
import Check from '@material-symbols/svg-400/rounded/check.svg?react'
import Close from '@material-symbols/svg-400/rounded/close.svg?react'
import ChevronRight from '@material-symbols/svg-400/rounded/chevron_right.svg?react'
import Undo from '@material-symbols/svg-400/rounded/undo.svg?react'
import Refresh from '@material-symbols/svg-400/rounded/refresh.svg?react'
import CalendarMonth from '@material-symbols/svg-400/rounded/calendar_month.svg?react'
import Warning from '@material-symbols/svg-400/rounded/warning.svg?react'
import Psychiatry from '@material-symbols/svg-400/rounded/psychiatry.svg?react'
import Stop from '@material-symbols/svg-400/rounded/stop.svg?react'
import LocationOn from '@material-symbols/svg-400/rounded/location_on.svg?react'
import Science from '@material-symbols/svg-400/rounded/science.svg?react'
import Schedule from '@material-symbols/svg-400/rounded/schedule.svg?react'
import Person from '@material-symbols/svg-400/rounded/person.svg?react'
import ExpandMore from '@material-symbols/svg-400/rounded/keyboard_arrow_down.svg?react' // equivalente de expand_more
import Grain from '@material-symbols/svg-400/rounded/grain.svg?react'
import Eco from '@material-symbols/svg-400/rounded/eco.svg?react'
import Spa from '@material-symbols/svg-400/rounded/spa.svg?react'
import RiceBowl from '@material-symbols/svg-400/rounded/rice_bowl.svg?react'
import Nutrition from '@material-symbols/svg-400/rounded/nutrition.svg?react'
import LocalFlorist from '@material-symbols/svg-400/rounded/local_florist.svg?react'
import CheckCircle from '@material-symbols/svg-400/rounded/check_circle.svg?react'
import Lightbulb from '@material-symbols/svg-400/rounded/lightbulb.svg?react'
import WbSunny from '@material-symbols/svg-400/rounded/wb_sunny.svg?react'
import PlayArrow from '@material-symbols/svg-400/rounded/play_arrow.svg?react'
import Pause from '@material-symbols/svg-400/rounded/pause.svg?react'
import BugReport from '@material-symbols/svg-400/rounded/bug_report.svg?react'
import Microbiology from '@material-symbols/svg-400/rounded/microbiology.svg?react'
import ImageIcono from '@material-symbols/svg-400/rounded/image.svg?react'
import Agriculture from '@material-symbols/svg-400/rounded/agriculture.svg?react'

export const iconos = {
  grass: Grass,
  map: Map,
  water_drop: WaterDrop,
  forum: Forum,
  volume_up: VolumeUp,
  volume_off: VolumeOff,
  add: Add,
  remove: Remove,
  send: Send,
  arrow_forward: ArrowForward,
  arrow_back: ArrowBack,
  layers: Layers,
  my_location: MyLocation,
  content_copy: ContentCopy,
  thermostat: Thermostat,
  rainy: Rainy,
  landscape: Landscape,
  delete: Delete,
  info: Info,
  check: Check,
  close: Close,
  chevron_right: ChevronRight,
  undo: Undo,
  refresh: Refresh,
  calendar_month: CalendarMonth,
  warning: Warning,
  psychiatry: Psychiatry,
  stop: Stop,
  location_on: LocationOn,
  science: Science,
  schedule: Schedule,
  person: Person,
  expand_more: ExpandMore,
  grain: Grain,
  eco: Eco,
  spa: Spa,
  rice_bowl: RiceBowl,
  nutrition: Nutrition,
  local_florist: LocalFlorist,
  check_circle: CheckCircle,
  wb_sunny: WbSunny,
  lightbulb: Lightbulb,
  play_arrow: PlayArrow,
  pause: Pause,
  bug_report: BugReport,
  microbiology: Microbiology,
  image: ImageIcono,
  agriculture: Agriculture,
} as const

export type NombreIcono = keyof typeof iconos

/** Versiones rellenas (se usan con la prop `relleno` de Icono). */
export const iconosRelleno: Partial<Record<NombreIcono, typeof Grass>> = {
  grass: GrassRelleno,
  map: MapRelleno,
  water_drop: WaterDropRelleno,
  forum: ForumRelleno,
}
