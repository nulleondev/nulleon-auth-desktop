# Display only the generated public QA fixture in an isolated X server.
import gi, sys

gi.require_version('Gtk', '3.0')
from gi.repository import Gtk
window = Gtk.Window(title='Nulleon Synthetic QR QA')
window.set_default_size(700, 700)
window.set_position(Gtk.WindowPosition.CENTER)
box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=12)
box.set_halign(Gtk.Align.CENTER)
box.set_valign(Gtk.Align.CENTER)
box.pack_start(Gtk.Label(label='SYNTHETIC QA ONLY — NO USER DATA'),False,False,0)
box.pack_start(Gtk.Image.new_from_file(sys.argv[1]),False,False,0)
window.add(box)
window.connect('destroy',Gtk.main_quit)
window.show_all()
Gtk.main()
