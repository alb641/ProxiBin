import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Adminreports } from './adminreports';

describe('Adminreports', () => {
  let component: Adminreports;
  let fixture: ComponentFixture<Adminreports>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Adminreports],
    }).compileComponents();

    fixture = TestBed.createComponent(Adminreports);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
